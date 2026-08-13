import type { ParamMatcher } from '@sveltejs/kit';
import { RESERVED_SEGMENTS } from '$lib/routing';

/**
 * The mirror of the module matcher: `/s/zentria/vex/v2026.8.1/services` lets
 * the greedy module swallow the version and leaves `services` sitting in the
 * version slot. A version is never one of our sub-route names.
 */
export const match: ParamMatcher = (param) => !RESERVED_SEGMENTS.has(param);
