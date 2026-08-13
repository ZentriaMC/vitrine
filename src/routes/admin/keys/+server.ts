import { createPublicKey } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { addKey, listKeys } from '$lib/server/trust';
import type { RequestHandler } from './$types';

/**
 * Trusted signing keys.
 *
 * Writing here decides what vitrine will call verified, so it is the highest
 * value target in the system: anyone who can add a key can make any signature
 * verify. There is no authentication in vitrine itself -- these paths are meant
 * to sit behind a reverse proxy that authenticates first.
 */
export const GET: RequestHandler = async ({ url }) => {
    const module = url.searchParams.get('module') ?? undefined;
    const keys = await listKeys(module);

    // The PEM is public, but listing it invites pasting the wrong thing back in.
    return json({
        keys: keys.map(({ pem, ...rest }) => ({ ...rest, pem_lines: pem.split('\n').length }))
    });
};

export const POST: RequestHandler = async ({ request }) => {
    let body: { module?: string; pem?: string; label?: string };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        error(400, 'body must be JSON');
    }

    const module = body.module?.trim();
    const pem = body.pem?.trim();

    if (!module) error(400, 'module is required, or "*" for every module');
    if (!pem) error(400, 'pem is required');

    // Reject an unusable key now rather than silently never matching a signature.
    try {
        createPublicKey(pem);
    } catch {
        error(400, 'pem is not a readable public key');
    }

    const row = await addKey({ module, pem, label: body.label?.trim() });
    return json(
        { id: row.id, module: row.module, hint: row.hint, label: row.label },
        { status: 201 }
    );
};
