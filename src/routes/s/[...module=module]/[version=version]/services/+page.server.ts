import { loadSchema } from '$lib/server/schema';
import type { IrService } from '$lib/ir';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const { ir } = await loadSchema(params.module, params.version);

    const services = Object.values(ir.nodes).filter(
        (node): node is IrService => node.kind === 'service'
    );

    // Every custom option that appears on any method, so the index can group by
    // one. Nothing here knows what `auth_scope` means -- whatever annotations a
    // schema carries become groupings for free.
    const optionNames = [
        ...new Set(
            services.flatMap((s) => s.methods.flatMap((m) => m.options.map((o) => o.shortName)))
        )
    ].sort();

    return {
        services: services.sort((a, b) => a.fqn.localeCompare(b.fqn)),
        optionNames
    };
};
