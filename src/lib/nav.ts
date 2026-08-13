import type { IrNode } from './ir';

/** One symbol in the sidebar. */
export interface NavSymbol {
    fqn: string;
    name: string;
    kind: IrNode['kind'];
    deprecated: boolean;
    /** How deeply nested the declaration is, for indentation. */
    depth: number;
}

/**
 * A file, without its symbols.
 *
 * The count is what the sidebar shows before a file is expanded. Shipping every
 * symbol up front cost 2 MB of the 3 MB an Injective page weighed -- once as
 * markup, once again as hydration state.
 */
export interface NavFile {
    name: string;
    symbols: number;
}

export interface NavPackage {
    name: string;
    files: NavFile[];
}

/** Response from the nav endpoint, for a search or a single file. */
export interface NavResult {
    symbols: NavSymbol[];
    /** How many matched in total, which may exceed what was returned. */
    total: number;
}

/** Search results are capped; the sidebar says so rather than silently trimming. */
export const NAV_SEARCH_LIMIT = 200;
