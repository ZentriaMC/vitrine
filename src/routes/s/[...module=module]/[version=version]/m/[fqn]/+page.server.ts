import { error } from '@sveltejs/kit';
import { collectRelated } from '$lib/server/related';
import { loadSchema } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const { ir } = await loadSchema(params.module, params.version);

    // A method FQN is its service's FQN plus one more segment, and method names
    // cannot contain dots -- so the split is unambiguous and needs no index.
    const dot = params.fqn.lastIndexOf('.');
    if (dot === -1) error(404, `Unknown method ${params.fqn}`);

    const service = ir.nodes[params.fqn.slice(0, dot)];
    if (!service || service.kind !== 'service') error(404, `Unknown method ${params.fqn}`);

    const method = service.methods.find((m) => m.name === params.fqn.slice(dot + 1));
    if (!method) error(404, `Unknown method ${params.fqn}`);

    const roots = [method.input, method.output]
        .filter((type) => type.kind === 'message')
        .map((type) => type.fqn);

    return { service, method, related: collectRelated(ir, roots) };
};
