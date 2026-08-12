import { listModules, resolveVersion } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const modules = await listModules();

    // Resolving the newest version of each module gives the index something to
    // show without pulling any descriptor sets: packages, build time and the
    // commit all come from manifest annotations.
    const summaries = await Promise.all(
        modules.map(async (module) => {
            try {
                return { ...module, latest: await resolveVersion(module.name, module.versions[0]) };
            } catch {
                // A repository holding something that is not a schema artifact.
                return { ...module, latest: undefined };
            }
        })
    );

    return { modules: summaries };
};
