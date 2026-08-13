/**
 * Descriptor sets, pulled from the registry and normalized on demand.
 *
 * The cache has two halves with different rules, which is the whole trick:
 * `tag -> digest` is mutable and lives in catalog.ts behind a TTL, while
 * `digest -> Ir` is content-addressed and therefore safe to keep forever. The
 * only bound here is memory, not correctness.
 */

import { env } from '$env/dynamic/private';
import { fromBinary } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import { normalize } from '$lib/normalize/normalize';
import { resolveVersion, type VersionInfo } from './catalog';
import { blob } from './registry';
import type { Ir } from '$lib/ir';

const MAX_CACHED = Number(env.VITRINE_IR_CACHE ?? 32);

/** digest -> Ir. Insertion order doubles as LRU order. */
const cache = new Map<string, Ir>();

export interface LoadedSchema {
    info: VersionInfo;
    ir: Ir;
}

export async function loadSchema(module: string, version: string): Promise<LoadedSchema> {
    const info = await resolveVersion(module, version);
    if (!info.schemaDigest) {
        throw new Error(`${module}:${version} has no descriptor set layer`);
    }

    const hit = cache.get(info.schemaDigest);
    if (hit) {
        // Re-insert to mark as most recently used.
        cache.delete(info.schemaDigest);
        cache.set(info.schemaDigest, hit);
        return { info, ir: hit };
    }

    const bytes = await blob(info.repo, info.schemaDigest);
    const ir = normalize(fromBinary(FileDescriptorSetSchema, bytes));

    cache.set(info.schemaDigest, ir);
    while (cache.size > MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }

    return { info, ir };
}
