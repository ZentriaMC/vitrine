<script lang="ts">
    import { untrack } from 'svelte';
    import { afterNavigate, goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { diffHref } from '$lib/links';
    import type { NavSymbol } from '$lib/nav';
    import type { LayoutServerData } from './$types';

    let { data, children }: { data: LayoutServerData; children: import('svelte').Snippet } =
        $props();

    let filter = $state('');

    /** Drawer state. Only meaningful below `md`, where the sidebar is off-canvas. */
    let drawer = $state(false);

    afterNavigate(() => untrack(() => (drawer = false)));

    const kindMark: Record<NavSymbol['kind'], string> = {
        message: 'M',
        enum: 'E',
        service: 'S'
    };

    const matches = (sym: NavSymbol) =>
        !filter || sym.fqn.toLowerCase().includes(filter.toLowerCase());

    let visible = $derived(
        data.packages
            .map((pkg) => ({
                ...pkg,
                files: pkg.files
                    .map((file) => ({ ...file, symbols: file.symbols.filter(matches) }))
                    .filter((file) => file.symbols.length)
            }))
            .filter((pkg) => pkg.files.length)
    );

    /** The next-oldest version, which is what "compare" defaults to. */
    let previousVersion = $derived.by(() => {
        const i = data.versions.indexOf(data.version);
        return i >= 0 && i + 1 < data.versions.length ? data.versions[i + 1] : undefined;
    });

    /**
     * Switching version keeps you on the same page rather than dropping you at
     * the overview -- comparing one type across two versions is the whole point.
     * Landing on a 404 because the symbol was removed is a useful answer too.
     */
    function samePageIn(version: string): string {
        const module = data.module;
        const fqn = page.params.fqn;
        const id = page.route.id ?? '';

        if (fqn && id.endsWith('/t/[fqn]')) {
            return resolve('/s/[...module=module]/[version=version]/t/[fqn]', {
                module,
                version,
                fqn
            });
        }
        if (fqn && id.endsWith('/m/[fqn]')) {
            return resolve('/s/[...module=module]/[version=version]/m/[fqn]', {
                module,
                version,
                fqn
            });
        }
        if (id.endsWith('/services')) {
            return resolve('/s/[...module=module]/[version=version]/services', { module, version });
        }
        if (page.params.against && id.endsWith('/diff/[against]')) {
            return resolve('/s/[...module=module]/[version=version]/diff/[against]', {
                module,
                version,
                against: page.params.against
            });
        }
        return resolve('/s/[...module=module]/[version=version]', { module, version });
    }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (drawer = false)} />

<div class="min-h-dvh md:flex">
    <header
        class="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/90"
    >
        <button
            type="button"
            onclick={() => (drawer = true)}
            aria-label="Open navigation"
            aria-expanded={drawer}
            class="rounded px-1.5 py-0.5 font-mono text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
            ≡
        </button>
        <a href={resolve('/')} class="font-mono text-sm font-semibold tracking-tight">vitrine</a>
        <span class="font-mono text-xs text-zinc-500">{data.module}:{data.version}</span>
        <a
            href={resolve('/s/[...module=module]/[version=version]/services', {
                module: data.module,
                version: data.version
            })}
            class="ml-auto font-mono text-xs text-zinc-500 hover:text-sky-600">services</a
        >
    </header>

    {#if drawer}
        <button
            type="button"
            onclick={() => (drawer = false)}
            aria-label="Close navigation"
            class="fixed inset-0 z-40 bg-black/40 md:hidden"
        ></button>
    {/if}

    <aside
        class="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] shrink-0 flex-col border-r border-zinc-200 bg-white transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-dvh md:max-w-none md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 {drawer
            ? 'translate-x-0'
            : '-translate-x-full'}"
    >
        <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div class="flex items-baseline justify-between">
                <a href={resolve('/')} class="font-mono text-sm font-semibold tracking-tight"
                    >vitrine</a
                >
                <span class="flex gap-3">
                    <a
                        href={resolve('/s/[...module=module]/[version=version]/services', {
                            module: data.module,
                            version: data.version
                        })}
                        class="font-mono text-xs text-zinc-500 hover:text-sky-600">services</a
                    >
                    {#if previousVersion}
                        <a
                            href={diffHref(previousVersion)}
                            class="font-mono text-xs text-zinc-500 hover:text-sky-600">compare</a
                        >
                    {/if}
                </span>
            </div>

            <p class="mt-1 font-mono text-[13px] break-all">{data.module}</p>

            <select
                value={data.version}
                onchange={(e) => goto(samePageIn(e.currentTarget.value))}
                aria-label="Schema version"
                class="mt-1 w-full rounded border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900"
            >
                {#each data.versions as version (version)}
                    <option value={version}>{version}</option>
                {/each}
            </select>

            <p class="mt-1.5 text-xs text-zinc-500">
                {data.counts.symbols} symbols in {data.counts.files} files
            </p>
            <p class="font-mono text-[10px] break-all text-zinc-400" title={data.info.digest}>
                {data.info.digest.slice(0, 19)}…
            </p>

            <input
                bind:value={filter}
                placeholder="Filter symbols"
                spellcheck="false"
                class="mt-3 w-full rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-400 focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900"
            />
        </div>

        <nav class="flex-1 overflow-y-auto px-2 py-3 text-sm">
            {#each visible as pkg (pkg.name)}
                <div class="mb-4">
                    <p class="px-2 pb-1 font-mono text-[11px] text-zinc-400">{pkg.name}</p>
                    {#each pkg.files as file (file.name)}
                        <p
                            class="truncate px-2 pt-1 pb-0.5 font-mono text-[11px] text-zinc-500"
                            title={file.name}
                        >
                            {file.name.split('/').pop()}
                        </p>
                        {#each file.symbols as sym (sym.fqn)}
                            <a
                                href={resolve('/s/[...module=module]/[version=version]/t/[fqn]', {
                                    module: data.module,
                                    version: data.version,
                                    fqn: sym.fqn
                                })}
                                class="flex items-center gap-2 rounded px-2 py-1 font-mono text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-900 {page
                                    .params.fqn === sym.fqn
                                    ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                    : ''}"
                                style="padding-left: {0.5 + sym.depth * 0.75}rem"
                            >
                                <span class="w-3 shrink-0 text-[10px] text-zinc-400"
                                    >{kindMark[sym.kind]}</span
                                >
                                <span class="truncate {sym.deprecated ? 'line-through' : ''}"
                                    >{sym.name}</span
                                >
                            </a>
                        {/each}
                    {/each}
                </div>
            {:else}
                <p class="px-2 text-xs text-zinc-500">No symbols match.</p>
            {/each}
        </nav>
    </aside>

    <main class="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        {@render children()}
    </main>
</div>
