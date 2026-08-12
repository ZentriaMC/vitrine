import { error } from '@sveltejs/kit';
import { collectRelated } from '$lib/server/related';
import { loadSchema } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const { ir } = await loadSchema(params.module, params.version);

    const node = ir.nodes[params.fqn];
    if (!node) error(404, `Unknown symbol ${params.fqn}`);

    // Services inline the shapes of every request and response they mention; a
    // message inlines its own field types so they can be drilled into in place.
    const roots =
        node.kind === 'service'
            ? node.methods
                  .flatMap((m) => [m.input, m.output])
                  .filter((type) => type.kind === 'message')
                  .map((type) => type.fqn)
            : [node.fqn];

    return {
        node,
        related: collectRelated(ir, roots),
        /** Inbound references, deduplicated -- a type can be used twice by one member. */
        xrefs: (ir.xrefs[node.fqn] ?? []).filter(
            (ref, i, all) =>
                all.findIndex((o) => o.from === ref.from && o.label === ref.label) === i
        )
    };
};
