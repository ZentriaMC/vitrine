/**
 * Modules and versions, as vitrine understands them.
 *
 * Maps registry repositories onto schema modules and tags onto versions, and
 * owns the mutable half of the cache. See docs/oci-artifact.md for the artifact
 * this is reading.
 */

import { env } from '$env/dynamic/private';
import {
    BREAKING_ARTIFACT_TYPE,
    isSignature,
    parseFindings,
    type BreakingFinding
} from '$lib/report';
import { catalog, manifest, referrerPayload, referrers, tags, type Manifest } from './registry';

// A vitrine registry holds nothing but schema artifacts, so every repository in
// it is a module. Set a prefix only when sharing a registry with other content.
const PREFIX = env.VITRINE_REPO_PREFIX ?? '';

export const ARTIFACT_TYPE = 'application/vnd.zentria.protoschema.v1';
export const DESCRIPTORSET_MEDIA_TYPE = 'application/vnd.zentria.protoschema.descriptorset.v1';

/**
 * How long a tag is trusted to point at the same digest. Tags are the only
 * mutable thing in the system; everything keyed by digest is cached forever.
 */
const TAG_TTL_MS = Number(env.VITRINE_TAG_TTL_MS ?? 30_000);

/**
 * The referrers tag schema parks an index of attached artifacts at a tag named
 * after the subject digest. Those are plumbing, not versions.
 */
const REFERRER_TAG = /^sha256-[0-9a-f]{64}$/;

export interface ModuleSummary {
    name: string;
    repo: string;
    versions: string[];
}

export interface VersionInfo {
    module: string;
    repo: string;
    version: string;
    digest: string;
    /** Digest of the descriptor set layer, or undefined if the artifact lacks one. */
    schemaDigest?: string;
    created?: string;
    revision?: string;
    source?: string;
    packages: string[];
}

interface Cached<T> {
    value: T;
    at: number;
}

let modulesCache: Cached<ModuleSummary[]> | undefined;
const versionCache = new Map<string, Cached<VersionInfo>>();

const fresh = <T>(entry: Cached<T> | undefined): entry is Cached<T> =>
    entry !== undefined && Date.now() - entry.at < TAG_TTL_MS;

export function repoFor(module: string): string {
    return PREFIX ? `${PREFIX}/${module}` : module;
}

/** Every schema module in the registry, with its versions newest-first. */
export async function listModules(): Promise<ModuleSummary[]> {
    if (fresh(modulesCache)) return modulesCache.value;

    const repos = (await catalog()).filter((repo) => !PREFIX || repo.startsWith(`${PREFIX}/`));

    const modules = await Promise.all(
        repos.map(async (repo) => ({
            name: PREFIX ? repo.slice(PREFIX.length + 1) : repo,
            repo,
            versions: (await tags(repo))
                .filter((tag) => !REFERRER_TAG.test(tag))
                .sort(compareVersions)
        }))
    );

    const value = modules
        .filter((module) => module.versions.length)
        .sort((a, b) => a.name.localeCompare(b.name));

    modulesCache = { value, at: Date.now() };
    return value;
}

/** Resolves module + version to a digest and the artifact's provenance. */
export async function resolveVersion(module: string, version: string): Promise<VersionInfo> {
    const key = `${module}:${version}`;
    const cached = versionCache.get(key);
    // A version addressed by digest is immutable, so it never needs revalidating.
    if (cached && (fresh(cached) || version.startsWith('sha256:'))) return cached.value;

    const repo = repoFor(module);
    const { digest, manifest: m } = await manifest(repo, version);

    const value: VersionInfo = {
        module,
        repo,
        version,
        digest,
        schemaDigest: schemaLayer(m)?.digest,
        created: m.annotations?.['org.opencontainers.image.created'],
        revision: m.annotations?.['org.opencontainers.image.revision'],
        source: m.annotations?.['org.opencontainers.image.source'],
        packages: (m.annotations?.['ee.zentria.protoschema.packages'] ?? '')
            .split(',')
            .filter(Boolean)
    };

    versionCache.set(key, { value, at: Date.now() });
    return value;
}

function schemaLayer(m: Manifest) {
    return m.layers?.find((layer) => layer.mediaType === DESCRIPTORSET_MEDIA_TYPE);
}

/**
 * Newest first. Tags are not ordered by the registry, and semver-ish tags sort
 * wrong lexically (`v1.10.0` before `v1.9.0`), so compare numeric runs.
 */
export function compareVersions(a: string, b: string): number {
    const partsA = a.split(/(\d+)/);
    const partsB = b.split(/(\d+)/);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const x = partsA[i] ?? '';
        const y = partsB[i] ?? '';
        if (x === y) continue;

        const nx = Number(x);
        const ny = Number(y);
        if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '') return ny - nx;
        return y.localeCompare(x);
    }
    return 0;
}

export interface ReferrerInfo {
    digest: string;
    artifactType?: string;
    size: number;
    annotations: Record<string, string>;
    /** Structured findings, for reports we can parse. */
    findings?: BreakingFinding[];
    /** Raw payload, shown when there is nothing structured to show instead. */
    text?: string;
    /** Sigstore bundle, for signature referrers, to be verified by the caller. */
    bundle?: string;
}

export async function listReferrers(repo: string, digest: string): Promise<ReferrerInfo[]> {
    const found = await referrers(repo, digest);

    return Promise.all(
        found.map(async (r) => {
            const base = {
                digest: r.digest,
                artifactType: r.artifactType,
                size: r.size,
                annotations: r.annotations ?? {}
            };
            if (isSignature(r.artifactType)) {
                const payload = await referrerPayload(repo, r.digest).catch(() => undefined);
                return { ...base, bundle: payload?.text };
            }

            if (r.artifactType !== BREAKING_ARTIFACT_TYPE) return base;

            const payload = await referrerPayload(repo, r.digest).catch(() => undefined);
            if (!payload) return base;

            const findings = parseFindings(payload.text);
            const leftover = payload.text.trim();
            // An empty report is a real result -- no breaking changes -- so keep
            // the empty array. Fall back to raw text only when something was
            // there and would not parse.
            return findings.length || !leftover
                ? { ...base, findings }
                : { ...base, text: leftover };
        })
    );
}
