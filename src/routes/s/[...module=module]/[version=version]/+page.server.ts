import { findNodeAt } from '$lib/ir';
import { listReferrers } from '$lib/server/catalog';
import { loadSchema } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

/**
 * Above this many symbols the overview lists files and counts, and symbols are
 * fetched per file when one is opened.
 *
 * Listing every symbol is the nicer page and costs nothing on a schema the size
 * of the sample. On Injective it was 987 kB of a 1.4 MB page -- the same mistake
 * the sidebar used to make, in a second place.
 */
const INLINE_SYMBOL_BUDGET = 400;

export const load: PageServerLoad = async ({ params }) => {
    const { ir, info } = await loadSchema(params.module, params.version);

    const total = Object.keys(ir.nodes).length;
    const inline = total <= INLINE_SYMBOL_BUDGET;

    const referrers = await listReferrers(info.repo, info.digest).catch(() => []);

    return {
        inline,
        files: ir.files.map((file) => ({
            name: file.name,
            package: file.package,
            comments: file.comments,
            // Imports of well-known types are noise on an overview page.
            dependencies: file.dependencies.filter((d) => !d.startsWith('google/protobuf/')),
            counts: {
                messages: file.messages.length,
                enums: file.enums.length,
                services: file.services.length
            },
            messages: inline ? file.messages : [],
            enums: inline ? file.enums : [],
            services: inline ? file.services : []
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
