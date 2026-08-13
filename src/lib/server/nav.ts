import type { Ir, IrNode } from '$lib/ir';
import type { NavPackage, NavSymbol } from '$lib/nav';

/** How deeply a declaration is nested, for sidebar indentation. */
function depthOf(ir: Ir, node: IrNode): number {
    let depth = 0;
    let parent = 'parent' in node ? node.parent : undefined;

    while (parent) {
        depth += 1;
        const next = ir.nodes[parent];
        parent = next && 'parent' in next ? next.parent : undefined;
    }

    return depth;
}

export function symbolsInFile(ir: Ir, file: string): NavSymbol[] {
    return Object.values(ir.nodes)
        .filter((node) => node.file === file)
        .map((node) => ({
            fqn: node.fqn,
            name: node.name,
            kind: node.kind,
            deprecated: node.deprecated,
            depth: depthOf(ir, node)
        }))
        .sort((a, b) => a.fqn.localeCompare(b.fqn));
}

/**
 * The sidebar skeleton: packages and files with symbol counts, no symbols.
 *
 * Symbols arrive per file from the nav endpoint when one is expanded.
 */
export function navTree(ir: Ir): NavPackage[] {
    const counts = new Map<string, number>();
    for (const node of Object.values(ir.nodes)) {
        counts.set(node.file, (counts.get(node.file) ?? 0) + 1);
    }

    const packages = new Map<string, NavPackage>();
    for (const file of ir.files) {
        const pkg = packages.get(file.package) ?? { name: file.package, files: [] };
        pkg.files.push({ name: file.name, symbols: counts.get(file.name) ?? 0 });
        packages.set(file.package, pkg);
    }

    return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Substring match over fully-qualified names, cheapest thing that works. */
export function searchSymbols(ir: Ir, query: string, limit: number): NavSymbol[] {
    const q = query.toLowerCase();
    const hits: IrNode[] = [];

    for (const node of Object.values(ir.nodes)) {
        if (node.fqn.toLowerCase().includes(q)) hits.push(node);
    }

    return hits
        .sort((a, b) => a.fqn.localeCompare(b.fqn))
        .slice(0, limit)
        .map((node) => ({
            fqn: node.fqn,
            name: node.name,
            kind: node.kind,
            deprecated: node.deprecated,
            depth: 0
        }));
}

export function countMatches(ir: Ir, query: string): number {
    const q = query.toLowerCase();
    let n = 0;
    for (const node of Object.values(ir.nodes)) if (node.fqn.toLowerCase().includes(q)) n += 1;
    return n;
}
