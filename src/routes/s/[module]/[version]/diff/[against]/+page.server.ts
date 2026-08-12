import { error } from '@sveltejs/kit';
import { diffSchemas } from '$lib/diff';
import { loadSchema } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    // `against` is the base and the route's own version is the newer side, so
    // the page reads "what changed to get here".
    const base = await loadSchema(params.module, params.against).catch(() => null);
    if (!base) error(404, `No schema at ${params.module}:${params.against}`);

    const head = await loadSchema(params.module, params.version);

    return {
        against: params.against,
        baseInfo: base.info,
        diff: diffSchemas(base.ir, head.ir)
    };
};
