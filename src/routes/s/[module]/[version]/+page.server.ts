import { findNodeAt } from '$lib/ir';
import { listReferrers } from '$lib/server/catalog';
import { loadSchema } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const { ir, info } = await loadSchema(params.module, params.version);

    // Signatures, breaking reports, SBOMs -- anything attached to this exact
    // artifact. Empty on registries without the OCI 1.1 referrers API.
    const referrers = await listReferrers(info.repo, info.digest).catch(() => []);

    return {
        files: ir.files.map((file) => ({
            ...file,
            // Imports of well-known types are noise on an overview page.
            dependencies: file.dependencies.filter((d) => !d.startsWith('google/protobuf/'))
        })),
        // Resolve each finding's position back to the symbol it is about, so a
        // report row can link into the browser instead of citing a line number.
        referrers: referrers.map((ref) => ({
            ...ref,
            findings: ref.findings?.map((finding) => ({
                ...finding,
                fqn: findNodeAt(ir, finding.path, finding.line)?.fqn
            }))
        }))
    };
};
