import { error } from '@sveltejs/kit';
import { listModules } from '$lib/server/catalog';
import { navTree, symbolsInFile } from '$lib/server/nav';
import { RegistryError, registryHost } from '$lib/server/registry';
import { loadSchema } from '$lib/server/schema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
    // A missing tag is the caller's problem; an unreachable registry is ours.
    const loaded = await loadSchema(params.module, params.version).catch((err: unknown) => {
        if (err instanceof RegistryError && err.status === 404) return null;
        error(
            503,
            `Registry ${registryHost} unavailable: ${err instanceof Error ? err.message : err}`
        );
    });
    if (!loaded) error(404, `No schema at ${params.module}:${params.version}`);

    const { ir, info } = loaded;

    // The file the current symbol lives in is expanded on arrival, so landing on
    // a type still shows its neighbours without a round trip. Everything else is
    // fetched when opened.
    const current = params.fqn ? ir.nodes[params.fqn] : undefined;
    const openFile = current?.file;

    const module = (await listModules()).find((m) => m.name === params.module);

    return {
        module: params.module,
        version: params.version,
        versions: module?.versions ?? [params.version],
        info,
        packages: navTree(ir),
        openFile,
        openSymbols: openFile ? symbolsInFile(ir, openFile) : [],
        counts: {
            files: ir.files.length,
            symbols: Object.keys(ir.nodes).length
        }
    };
};
