/**
 * A minimal OCI Distribution client.
 *
 * Only the four calls vitrine needs: list repositories, list tags, resolve a
 * manifest, fetch a blob. Deliberately dependency-free and deliberately not
 * shelling out to `oras` -- descriptor sets are small, and we want them in
 * memory keyed by digest rather than written to a temp directory.
 *
 * `_catalog` is optional in the distribution spec. registry:3 and Harbor
 * implement it; ghcr.io and Docker Hub do not. We target registry:3, so we use
 * it -- see `catalog()` for what to do instead if that ever changes.
 */

const REGISTRY = process.env.VITRINE_REGISTRY ?? 'localhost:5050';

/** Registries on loopback are plain HTTP; anything else is assumed to be TLS. */
const PLAIN_HTTP =
    process.env.VITRINE_REGISTRY_PLAIN_HTTP === '1' ||
    /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(REGISTRY);

const BASE = `${PLAIN_HTTP ? 'http' : 'https'}://${REGISTRY}/v2`;

const USERNAME = process.env.VITRINE_REGISTRY_USERNAME;
const PASSWORD = process.env.VITRINE_REGISTRY_PASSWORD;

const MANIFEST_ACCEPT = [
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json'
].join(', ');

export interface Descriptor {
    mediaType: string;
    digest: string;
    size: number;
    annotations?: Record<string, string>;
}

export interface Manifest {
    schemaVersion: number;
    mediaType?: string;
    artifactType?: string;
    config?: Descriptor;
    layers?: Descriptor[];
    /** Present on an image index, including the referrers tag schema. */
    manifests?: Referrer[];
    annotations?: Record<string, string>;
}

export class RegistryError extends Error {
    constructor(
        readonly status: number,
        readonly url: string,
        body: string
    ) {
        super(`registry ${status} for ${url}: ${body.slice(0, 200)}`);
        this.name = 'RegistryError';
    }
}

/** Bearer tokens, keyed by the scope they were issued for. */
const tokens = new Map<string, { token: string; expires: number }>();

/**
 * Fetch with the registry token dance: an unauthenticated request gets a 401
 * carrying a `WWW-Authenticate` challenge naming a token endpoint, we exchange
 * credentials there for a scoped bearer token, then retry.
 *
 * Anonymous registries (like dev/compose.yaml) never issue the challenge, so
 * this costs nothing locally.
 */
async function registryFetch(path: string, accept?: string): Promise<Response> {
    const url = `${BASE}${path}`;
    const headers: Record<string, string> = accept ? { accept } : {};

    let res = await fetch(url, { headers });
    if (res.status !== 401) return res;

    const challenge = res.headers.get('www-authenticate');
    if (!challenge?.toLowerCase().startsWith('bearer ')) return res;

    const token = await bearerToken(challenge);
    if (!token) return res;

    res = await fetch(url, { headers: { ...headers, authorization: `Bearer ${token}` } });
    return res;
}

async function bearerToken(challenge: string): Promise<string | undefined> {
    const params = new Map<string, string>();
    for (const [, k, v] of challenge.slice(7).matchAll(/(\w+)="([^"]*)"/g)) params.set(k, v);

    const realm = params.get('realm');
    if (!realm) return undefined;

    const scope = params.get('scope') ?? '';
    const cached = tokens.get(scope);
    if (cached && cached.expires > Date.now()) return cached.token;

    const url = new URL(realm);
    if (params.get('service')) url.searchParams.set('service', params.get('service')!);
    if (scope) url.searchParams.set('scope', scope);

    const headers: Record<string, string> = {};
    if (USERNAME && PASSWORD) {
        headers.authorization = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return undefined;

    const body = (await res.json()) as {
        token?: string;
        access_token?: string;
        expires_in?: number;
    };
    const token = body.token ?? body.access_token;
    if (!token) return undefined;

    // Shave the advertised lifetime so a token cannot expire mid-flight.
    tokens.set(scope, { token, expires: Date.now() + ((body.expires_in ?? 60) - 10) * 1000 });
    return token;
}

async function json<T>(path: string, accept?: string): Promise<T> {
    const res = await registryFetch(path, accept);
    if (!res.ok) throw new RegistryError(res.status, path, await res.text());
    return (await res.json()) as T;
}

/** Every repository the registry knows about. */
export async function catalog(): Promise<string[]> {
    const body = await json<{ repositories?: string[] }>('/_catalog?n=1000');
    return body.repositories ?? [];
}

export async function tags(repo: string): Promise<string[]> {
    try {
        const body = await json<{ tags?: string[] | null }>(`/${repo}/tags/list`);
        return body.tags ?? [];
    } catch (err) {
        // A repository with every tag deleted 404s rather than returning [].
        if (err instanceof RegistryError && err.status === 404) return [];
        throw err;
    }
}

/**
 * Resolves a tag or digest to both the manifest and the digest it lives at.
 *
 * The digest is the important half: everything downstream caches on it, because
 * content addressing makes it safe to cache forever.
 */
export async function manifest(
    repo: string,
    reference: string
): Promise<{ digest: string; manifest: Manifest }> {
    const res = await registryFetch(`/${repo}/manifests/${reference}`, MANIFEST_ACCEPT);
    if (!res.ok)
        throw new RegistryError(res.status, `/${repo}/manifests/${reference}`, await res.text());

    const body = (await res.json()) as Manifest;
    const digest = res.headers.get('docker-content-digest') ?? reference;
    return { digest, manifest: body };
}

export async function blob(repo: string, digest: string): Promise<Uint8Array> {
    const res = await registryFetch(`/${repo}/blobs/${digest}`);
    if (!res.ok) throw new RegistryError(res.status, `/${repo}/blobs/${digest}`, await res.text());
    return new Uint8Array(await res.arrayBuffer());
}

export const registryHost = REGISTRY;

export interface Referrer extends Descriptor {
    artifactType?: string;
}

/**
 * Artifacts that point at this one: signatures, reports, SBOMs.
 *
 * Two ways to ask. The OCI 1.1 referrers API is the good one, but plenty of
 * registries -- including the registry:3 build in dev/compose.yaml -- do not
 * route it. The spec's fallback is the referrers tag schema: an image index
 * parked at a tag derived from the subject digest, which `oras attach` writes
 * and `oras discover` reads. Try the endpoint, fall back to the tag.
 */
export async function referrers(repo: string, digest: string): Promise<Referrer[]> {
    try {
        const body = await json<{ manifests?: Referrer[] }>(
            `/${repo}/referrers/${digest}`,
            'application/vnd.oci.image.index.v1+json'
        );
        return body.manifests ?? [];
    } catch (err) {
        if (!(err instanceof RegistryError) || ![400, 404].includes(err.status)) throw err;
    }

    try {
        // sha256:abc… -> sha256-abc…
        const { manifest: index } = await manifest(repo, digest.replace(':', '-'));
        return index.manifests ?? [];
    } catch (err) {
        if (err instanceof RegistryError && err.status === 404) return [];
        throw err;
    }
}

/**
 * The first layer of a referring artifact, decoded as text.
 *
 * The layer's media type comes back too: artifactType says what an attachment
 * is, mediaType says how it is encoded, and only the latter tells a renderer
 * whether it is looking at JSON lines or prose.
 */
export async function referrerPayload(
    repo: string,
    digest: string
): Promise<{ mediaType: string; text: string } | undefined> {
    const { manifest: m } = await manifest(repo, digest);
    const layer = m.layers?.[0];
    if (!layer) return undefined;
    return {
        mediaType: layer.mediaType,
        text: new TextDecoder().decode(await blob(repo, layer.digest))
    };
}
