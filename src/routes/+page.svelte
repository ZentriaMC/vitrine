<script lang="ts">
    import { resolve } from '$app/paths';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-10 md:px-8">
    <header class="mb-8">
        <h1 class="font-mono text-xl font-semibold tracking-tight">vitrine</h1>
        <p class="mt-1 text-sm text-zinc-500">
            {data.modules.length} schema {data.modules.length === 1 ? 'module' : 'modules'} in the registry.
        </p>
    </header>

    <ul class="space-y-4">
        {#each data.modules as module (module.name)}
            <li class="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div class="flex flex-wrap items-baseline gap-x-3">
                    <a
                        href={resolve('/s/[module]/[version]', {
                            module: module.name,
                            version: module.versions[0]
                        })}
                        class="font-mono text-sm font-semibold text-sky-700 hover:underline dark:text-sky-400"
                    >
                        {module.name}
                    </a>
                    <span class="font-mono text-xs text-zinc-500">
                        {module.versions.length}
                        {module.versions.length === 1 ? 'version' : 'versions'}
                    </span>
                    {#if module.latest?.created}
                        <span class="font-mono text-xs text-zinc-400">
                            newest {module.latest.created}
                        </span>
                    {/if}
                </div>

                {#if module.latest?.packages.length}
                    <p class="mt-1 font-mono text-xs text-zinc-500">
                        {module.latest.packages.join(', ')}
                    </p>
                {/if}

                <ul class="mt-2 flex flex-wrap gap-2">
                    {#each module.versions.slice(0, 8) as version (version)}
                        <li>
                            <a
                                href={resolve('/s/[module]/[version]', {
                                    module: module.name,
                                    version
                                })}
                                class="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 hover:bg-sky-100 hover:text-sky-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-sky-950 dark:hover:text-sky-300"
                            >
                                {version}
                            </a>
                        </li>
                    {/each}
                </ul>
            </li>
        {:else}
            <li class="text-sm text-zinc-500">
                Nothing in the registry yet. Push one with <span class="font-mono">just push</span>.
            </li>
        {/each}
    </ul>
</div>
