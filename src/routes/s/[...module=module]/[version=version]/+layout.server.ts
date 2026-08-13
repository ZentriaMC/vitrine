import { error } from '@sveltejs/kit';
import { listModules } from '$lib/server/catalog';
import { RegistryError, registryHost } from '$lib/server/registry';
import { loadSchema } from '$lib/server/schema';
import type { IrNode } from '$lib/ir';
import type { NavSymbol } from '$lib/nav';
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

    const depthOf = (node: IrNode): number => {
        let depth = 0;
        let parent = 'parent' in node ? node.parent : undefined;
        while (parent) {
            depth += 1;
            const next = ir.nodes[parent];
            parent = next && 'parent' in next ? next.parent : undefined;
        }
        return depth;
    };

    const byFile = new Map<string, NavSymbol[]>();
    for (const node of Object.values(ir.nodes)) {
        const symbols = byFile.get(node.file) ?? [];
        symbols.push({
            fqn: node.fqn,
            name: node.name,
            kind: node.kind,
            deprecated: node.deprecated,
            depth: depthOf(node)
        });
        byFile.set(node.file, symbols);
    }

    const packages = new Map<string, { name: string; symbols: NavSymbol[] }[]>();
    for (const file of ir.files) {
        const symbols = (byFile.get(file.name) ?? []).sort((a, b) => a.fqn.localeCompare(b.fqn));
        const files = packages.get(file.package) ?? [];
        files.push({ name: file.name, symbols });
        packages.set(file.package, files);
    }

    const module = (await listModules()).find((m) => m.name === params.module);

    return {
        module: params.module,
        version: params.version,
        versions: module?.versions ?? [params.version],
        info,
        packages: [...packages].map(([name, files]) => ({ name, files })),
        counts: {
            files: ir.files.length,
            symbols: Object.keys(ir.nodes).length
        }
    };
};
