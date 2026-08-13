import { readFileSync } from 'node:fs';
import { fromBinary } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import { normalize } from '$lib/normalize/normalize';
import type { Ir } from '$lib/ir';

/** Normalized fixture schemas. See README.md in this directory. */
export function loadFixture(version: 'v1' | 'v2'): Ir {
    const bytes = readFileSync(new URL(`./sample-${version}.binpb`, import.meta.url));
    return normalize(fromBinary(FileDescriptorSetSchema, bytes));
}

export const DEMO = 'zentria.vitrine.demo.v1';
export const COMPLEX = 'zentria/vitrine/demo/v1/complex.proto';
