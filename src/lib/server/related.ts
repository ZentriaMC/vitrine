import type { Ir, IrTypeRef, RelatedNodes } from '$lib/ir';

/**
 * Collects the types reachable from a set of roots, breadth-first.
 *
 * Inlining a request message means also shipping the types of its fields, and
 * theirs, and so on -- but not the whole schema. `maxDepth` bounds how far the
 * UI can drill before it has to fall back to a link. Roots sit at depth 0, so
 * the default reaches a field's field's field.
 */
export function collectRelated(ir: Ir, roots: string[], maxDepth = 3): RelatedNodes {
    const out: RelatedNodes = {};
    const queue: [string, number][] = roots.map((fqn) => [fqn, 0]);

    while (queue.length) {
        const [fqn, depth] = queue.shift()!;
        if (out[fqn] || depth > maxDepth) continue;

        const node = ir.nodes[fqn];
        // Well-known types have no node, and a service is never a field type.
        if (!node || node.kind === 'service') continue;
        out[fqn] = node;

        if (node.kind !== 'message') continue;
        for (const field of node.fields) {
            for (const ref of referencedTypes(field.type)) queue.push([ref, depth + 1]);
        }
    }

    return out;
}

function referencedTypes(type: IrTypeRef): string[] {
    switch (type.kind) {
        case 'scalar':
            return [];
        case 'map':
            return [...referencedTypes(type.key), ...referencedTypes(type.value)];
        default:
            return type.local ? [type.fqn] : [];
    }
}
