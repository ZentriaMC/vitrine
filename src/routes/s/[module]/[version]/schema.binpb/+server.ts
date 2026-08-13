import { error } from '@sveltejs/kit';
import { DESCRIPTORSET_MEDIA_TYPE, resolveVersion } from '$lib/server/catalog';
import { blob, RegistryError, registryHost } from '$lib/server/registry';
import type { RequestHandler } from './$types';

/**
 * The raw FileDescriptorSet, served straight through from the registry.
 *
 * This is the whole machine-readable story in one route. A descriptor set is
 * self-contained, so anything that speaks protobuf works off it with no further
 * concepts -- and consumers need neither `oras` nor registry credentials:
 *
 *     curl -sO http://vitrine/s/sample/v2.0.0/schema.binpb
 *     grpcurl -protoset schema.binpb list
 *     buf curl --schema schema.binpb ...
 *     buf breaking --against schema.binpb
 */
export const GET: RequestHandler = async ({ params, request, setHeaders }) => {
    const info = await resolveVersion(params.module, params.version).catch((err: unknown) => {
        if (err instanceof RegistryError && err.status === 404) return null;
        error(503, `Registry ${registryHost} unavailable`);
    });

    if (!info) error(404, `No schema at ${params.module}:${params.version}`);
    if (!info.schemaDigest) {
        error(404, `${params.module}:${params.version} has no descriptor set layer`);
    }

    // The layer digest is already a content hash, so it is the natural ETag --
    // CI polling this gets a 304 instead of 100 kB.
    const etag = `"${info.schemaDigest}"`;
    if (request.headers.get('if-none-match') === etag) {
        return new Response(null, { status: 304, headers: { etag } });
    }

    const bytes = await blob(info.repo, info.schemaDigest);

    // A version pinned by digest can never change; a tag can be moved.
    const immutable = params.version.startsWith('sha256:');
    setHeaders({
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=30'
    });

    // Hand Response its own ArrayBuffer: TypeScript's Uint8Array is generic over
    // its backing buffer and does not satisfy BodyInit directly.
    const body = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
        headers: {
            etag,
            'content-type': DESCRIPTORSET_MEDIA_TYPE,
            'content-length': String(bytes.byteLength),
            'content-disposition': `attachment; filename="${params.module}-${params.version}.binpb"`
        }
    });
};
