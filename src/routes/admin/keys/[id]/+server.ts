import { error, json } from '@sveltejs/kit';
import { removeKey } from '$lib/server/trust';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
    if (!(await removeKey(params.id))) error(404, `no key ${params.id}`);
    return json({ deleted: params.id });
};
