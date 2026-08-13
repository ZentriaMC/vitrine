import { json } from '@sveltejs/kit';
import { NAV_SEARCH_LIMIT, type NavResult } from '$lib/nav';
import { countMatches, searchSymbols, symbolsInFile } from '$lib/server/nav';
import { loadSchema } from '$lib/server/schema';
import type { RequestHandler } from './$types';

/**
 * Sidebar symbols, on demand.
 *
 * `?file=` returns one file's symbols, `?q=` searches the whole schema. Either
 * way the response is kilobytes, where shipping every symbol with the layout
 * cost two thirds of a 3 MB page on a schema the size of Injective's.
 */
export const GET: RequestHandler = async ({ params, url, setHeaders }) => {
    const { ir } = await loadSchema(params.module, params.version);

    const file = url.searchParams.get('file');
    if (file) {
        const symbols = symbolsInFile(ir, file);
        // Keyed by an immutable schema, so the answer cannot change.
        setHeaders({ 'cache-control': 'private, max-age=300' });
        return json({ symbols, total: symbols.length } satisfies NavResult);
    }

    const query = url.searchParams.get('q')?.trim();
    if (!query) return json({ symbols: [], total: 0 } satisfies NavResult);

    return json({
        symbols: searchSymbols(ir, query, NAV_SEARCH_LIMIT),
        total: countMatches(ir, query)
    } satisfies NavResult);
};
