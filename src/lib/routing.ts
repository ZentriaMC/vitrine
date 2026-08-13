/**
 * Path segments that name a sub-route rather than data.
 *
 * Module names are rest parameters, so these are what tells SvelteKit where a
 * module ends. A module or version literally called `diff` or `services` would
 * be shadowed by its own sub-route -- pathological, and the price of arbitrary
 * module depth.
 */
export const RESERVED_SEGMENTS = new Set(['t', 'm', 'diff', 'services', 'schema.binpb']);
