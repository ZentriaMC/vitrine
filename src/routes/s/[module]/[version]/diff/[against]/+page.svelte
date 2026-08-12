<script lang="ts">
    import { goto } from '$app/navigation';
    import Badge from '$lib/components/Badge.svelte';
    import { displayType, type ChangeKind, type NodeDiff } from '$lib/diff';
    import { diffHref, typeHref } from '$lib/links';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let showDocs = $state(false);

    let nodes = $derived(data.diff.nodes.filter((n) => showDocs || !n.docsOnly));

    const tone: Record<ChangeKind, 'accent' | 'danger' | 'warn'> = {
        added: 'accent',
        removed: 'danger',
        modified: 'warn'
    };

    const mark: Record<ChangeKind, string> = { added: '+', removed: '−', modified: '~' };

    /** Other versions of this module, excluding the one we are already at. */
    let bases = $derived(data.versions.filter((v) => v !== data.version));

    const summary = (node: NodeDiff) => {
        if (node.change !== 'modified') return '';
        const n = node.members.length + node.changes.length;
        return `${n} ${n === 1 ? 'change' : 'changes'}`;
    };
</script>

<header class="border-b border-zinc-200 pb-5 dark:border-zinc-800">
    <h1 class="font-mono text-xl font-semibold tracking-tight">Changes</h1>

    <div class="mt-2 flex flex-wrap items-center gap-2 font-mono text-[13px]">
        <label class="flex items-center gap-2">
            <span class="text-zinc-500">from</span>
            <select
                value={data.against}
                onchange={(e) => goto(diffHref(e.currentTarget.value))}
                aria-label="Base version"
                class="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900"
            >
                {#each bases as version (version)}
                    <option value={version}>{version}</option>
                {/each}
            </select>
        </label>
        <span class="text-zinc-400">&rarr;</span>
        <span>{data.version}</span>
    </div>

    <p class="mt-3 flex flex-wrap gap-2 text-sm">
        <Badge tone="accent">{data.diff.counts.added} added</Badge>
        <Badge tone="danger">{data.diff.counts.removed} removed</Badge>
        <Badge tone="warn">{data.diff.counts.modified} modified</Badge>
        {#if data.diff.counts.docsOnly}
            <Badge>{data.diff.counts.docsOnly} docs only</Badge>
        {/if}
    </p>

    <p class="mt-3 max-w-3xl text-sm text-zinc-500">
        Structural changes only. Whether any of them break a consumer is
        <span class="font-mono">buf breaking</span>'s call, and its report is attached to the
        artifact as a referrer.
    </p>

    {#if data.diff.counts.docsOnly}
        <label class="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" bind:checked={showDocs} />
            show documentation-only changes
        </label>
    {/if}
</header>

<div class="mt-6 max-w-5xl space-y-4">
    {#each nodes as node (node.fqn + node.change)}
        <section class="border-b border-zinc-100 pb-3 dark:border-zinc-900">
            <div class="flex flex-wrap items-baseline gap-2">
                <span class="w-3 shrink-0 text-center font-mono text-sm text-zinc-400"
                    >{mark[node.change]}</span
                >
                <Badge tone={tone[node.change]}>{node.change}</Badge>
                <Badge>{node.kind}</Badge>
                {#if node.change === 'removed'}
                    <span class="font-mono text-[15px] line-through">{node.name}</span>
                {:else}
                    <a
                        href={typeHref(node.fqn)}
                        class="font-mono text-[15px] text-sky-700 hover:underline dark:text-sky-400"
                        >{node.name}</a
                    >
                {/if}
                {#if node.docsOnly}<Badge>docs</Badge>{/if}
                <span class="font-mono text-[11px] text-zinc-400">{summary(node)}</span>
            </div>

            <p class="mt-0.5 pl-5 font-mono text-[11px] break-all text-zinc-400">{node.fqn}</p>

            {#if node.changes.length}
                <ul class="mt-2 space-y-0.5 pl-5">
                    {#each node.changes as change (change.label)}
                        <li class="font-mono text-[13px]">
                            <span class="text-zinc-500">{change.label}</span>
                            {#if change.before !== undefined || change.after !== undefined}
                                <span class="text-rose-700 dark:text-rose-400"
                                    >{displayType(change.before ?? '-')}</span
                                >
                                <span class="text-zinc-400">&rarr;</span>
                                <span class="text-emerald-700 dark:text-emerald-400"
                                    >{displayType(change.after ?? '-')}</span
                                >
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}

            {#if node.members.length}
                <ul class="mt-2 space-y-1 pl-5">
                    {#each node.members as member (member.name)}
                        <li>
                            <div class="flex flex-wrap items-baseline gap-2">
                                <span class="font-mono text-xs text-zinc-400">
                                    {mark[member.change]}{member.tag !== undefined
                                        ? ` ${member.tag}`
                                        : ''}
                                </span>
                                <span
                                    class="font-mono text-[13px] {member.change === 'removed'
                                        ? 'line-through'
                                        : ''}">{member.name}</span
                                >
                                {#if member.change !== 'modified' && member.signature}
                                    <span class="font-mono text-[13px] text-zinc-500"
                                        >{displayType(member.signature)}</span
                                    >
                                {/if}
                                {#if member.docsOnly}<Badge>docs</Badge>{/if}
                            </div>

                            {#if member.changes.length}
                                <ul class="mt-0.5 space-y-0.5 pl-6">
                                    {#each member.changes as change (change.label)}
                                        <li class="font-mono text-[12px]">
                                            <span class="text-zinc-500">{change.label}</span>
                                            {#if change.before !== undefined || change.after !== undefined}
                                                <span class="text-rose-700 dark:text-rose-400"
                                                    >{displayType(change.before ?? '-')}</span
                                                >
                                                <span class="text-zinc-400">&rarr;</span>
                                                <span class="text-emerald-700 dark:text-emerald-400"
                                                    >{displayType(change.after ?? '-')}</span
                                                >
                                            {/if}
                                        </li>
                                    {/each}
                                </ul>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {:else}
        <p class="text-sm text-zinc-500">
            No structural differences between {data.against} and {data.version}.
        </p>
    {/each}
</div>
