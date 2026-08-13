import { findNodeAt } from '$lib/ir';
import { isSignature } from '$lib/report';
import { listReferrers } from '$lib/server/catalog';
import { loadSchema } from '$lib/server/schema';
import { listKeys } from '$lib/server/trust';
import { verifyBundle } from '$lib/server/verify';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const { ir, info } = await loadSchema(params.module, params.version);

    const referrers = await listReferrers(info.repo, info.digest).catch(() => []);

    // Verification happens here rather than in the UI: the trust store is
    // server state, and a verdict computed in the browser proves nothing.
    const trusted = referrers.some((r) => isSignature(r.artifactType))
        ? await listKeys(params.module)
        : [];

    return {
        // Every symbol, on every schema. This is the view you come here for, and
        // the cost is transfer size rather than time: even Injective's 3610
        // symbols normalize in ~1.2s cold and serve in ~0.1s warm from the
        // digest cache. Bounding it optimised the wrong axis.
        files: ir.files.map((file) => ({
            ...file,
            // Imports of well-known types are noise on an overview page.
            dependencies: file.dependencies.filter((d) => !d.startsWith('google/protobuf/'))
        })),
        // Resolve each finding's position back to the symbol it is about, so a
        // report row can link into the browser instead of citing a line number.
        referrers: referrers.map(({ bundle, ...ref }) => ({
            ...ref,
            verdict: bundle ? verifyBundle(bundle, info.digest, trusted) : undefined,
            findings: ref.findings?.map((finding) => ({
                ...finding,
                fqn: findNodeAt(ir, finding.path, finding.line)?.fqn
            }))
        }))
    };
};
