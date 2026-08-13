<script lang="ts">
    import { methodHref, typeHref } from '$lib/links';
    import Badge from '$lib/components/Badge.svelte';
    import Meta from '$lib/components/Meta.svelte';
    import { pageTitle } from '$lib/meta';
    import Comments from '$lib/components/Comments.svelte';
    import Options from '$lib/components/Options.svelte';
    import TypeRef from '$lib/components/TypeRef.svelte';
    import type { IrMethod, IrMethodKind, IrService } from '$lib/ir';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let filter = $state('');
    let groupBy = $state('service');

    const streaming: Record<IrMethodKind, string> = {
        unary: 'unary',
        server_streaming: 'server stream',
        client_streaming: 'client stream',
        bidi_streaming: 'bidi stream'
    };

    interface Row {
        method: IrMethod;
        service: IrService;
    }

    let rows = $derived(
        data.services.flatMap((service) => service.methods.map((method) => ({ method, service })))
    );

    let matched = $derived(
        rows.filter(({ method, service }) => {
            const q = filter.toLowerCase();
            return (
                !q ||
                method.fqn.toLowerCase().includes(q) ||
                service.name.toLowerCase().includes(q) ||
                (method.comments.leading ?? '').toLowerCase().includes(q) ||
                method.options.some((o) => String(o.value).toLowerCase().includes(q))
            );
        })
    );

    /** Ungrouped rows sort by name; grouped rows sort by group then name. */
    const groupKey = (row: Row) =>
        groupBy === 'service'
            ? row.service.name
            : (row.method.options.find((o) => o.shortName === groupBy)?.value?.toString() ?? '—');

    let groups = $derived.by(() => {
        const buckets: Record<string, Row[]> = {};
        for (const row of matched) (buckets[groupKey(row)] ??= []).push(row);
        return Object.keys(buckets)
            .sort((a, b) => a.localeCompare(b))
            .map((key) => [key, buckets[key]] as const);
    });
</script>

<Meta
    title={pageTitle('Services', `${data.module}:${data.version}`)}
    description="{rows.length} RPCs across {data.services.length} services."
/>

<header class="mb-6">
    <h1 class="font-mono text-xl font-semibold tracking-tight">Services</h1>
    <p class="mt-1 text-sm text-zinc-500">
        {rows.length} RPCs across {data.services.length} services.
    </p>

    <div class="mt-4 flex flex-wrap items-center gap-3">
        <input
            bind:value={filter}
            placeholder="Filter RPCs"
            spellcheck="false"
            class="w-64 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-400 focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900"
        />
        <label class="flex items-center gap-2 text-xs text-zinc-500">
            group by
            <select
                bind:value={groupBy}
                class="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900"
            >
                <option value="service">service</option>
                {#each data.optionNames as name (name)}
                    <option value={name}>({name})</option>
                {/each}
            </select>
        </label>
    </div>
</header>

<div class="max-w-5xl space-y-6">
    {#each groups as [key, groupRows] (key)}
        <section>
            <h2
                class="mb-1 flex items-baseline gap-2 border-b border-zinc-200 pb-1 dark:border-zinc-800"
            >
                <span class="font-mono text-sm font-semibold">{key}</span>
                <span class="text-xs text-zinc-400">{groupRows.length}</span>
            </h2>

            {#if groupBy === 'service' && groupRows[0]}
                <div class="mt-1 mb-2 max-w-3xl">
                    <Comments comments={groupRows[0].service.comments} compact />
                </div>
            {/if}

            <ul>
                {#each groupRows as { method, service } (method.fqn)}
                    <li class="border-b border-zinc-100 py-1.5 dark:border-zinc-900">
                        <div class="flex flex-wrap items-baseline gap-x-2">
                            <a
                                href={methodHref(method.fqn)}
                                class="font-mono text-[13px] text-sky-700 hover:underline dark:text-sky-400 {method.deprecated
                                    ? 'line-through'
                                    : ''}"
                            >
                                {method.name}
                            </a>
                            {#if groupBy !== 'service'}
                                <a
                                    href={typeHref(service.fqn)}
                                    class="font-mono text-[11px] text-zinc-500 hover:underline"
                                >
                                    {service.name}
                                </a>
                            {/if}
                            <Badge tone={method.methodKind === 'unary' ? 'neutral' : 'accent'}>
                                {streaming[method.methodKind]}
                            </Badge>
                            {#if method.deprecated}<Badge tone="danger">deprecated</Badge>{/if}
                            <span class="font-mono text-[13px]">
                                <TypeRef type={method.input} />
                                <span class="text-zinc-400">&rarr;</span>
                                <TypeRef type={method.output} />
                            </span>
                            <Options options={method.options} />
                        </div>

                        <div class="mt-0.5 max-w-3xl">
                            <Comments comments={method.comments} compact />
                        </div>
                    </li>
                {/each}
            </ul>
        </section>
    {:else}
        <p class="text-sm text-zinc-500">No RPCs match.</p>
    {/each}
</div>
