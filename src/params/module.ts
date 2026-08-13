import type { ParamMatcher } from '@sveltejs/kit';
import { RESERVED_SEGMENTS } from '$lib/routing';

/**
 * A module name may span any number of path segments (`zentria/vex`), which
 * makes `[...module]` greedy: for `/s/sample/v2.0.0/diff/v1.10.0` it happily
 * swallows `sample/v2.0.0/diff` and leaves `v1.10.0` as the version, matching
 * the overview route before the diff route is ever tried.
 *
 * Rejecting a trailing reserved segment makes that match fail, so SvelteKit
 * moves on to the route that actually wanted it.
 */
export const match: ParamMatcher = (param) => {
    const segments = param.split('/');
    return (
        segments.length > 0 &&
        !segments.some((segment) => segment === '') &&
        !RESERVED_SEGMENTS.has(segments[segments.length - 1])
    );
};
