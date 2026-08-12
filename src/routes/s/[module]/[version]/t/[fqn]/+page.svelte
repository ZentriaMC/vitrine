<script lang="ts">
    import { typeHref } from '$lib/links';
    import Badge from '$lib/components/Badge.svelte';
    import Comments from '$lib/components/Comments.svelte';
    import MessageInline from '$lib/components/MessageInline.svelte';
    import MethodCard from '$lib/components/MethodCard.svelte';
    import Options from '$lib/components/Options.svelte';
    import { hasComments, shortName, type IrReservedRange } from '$lib/ir';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let node = $derived(data.node);

    const range = (r: IrReservedRange) =>
        r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`;
</script>

<header class="border-b border-zinc-200 pb-5 dark:border-zinc-800">
    <div class="flex flex-wrap items-center gap-2">
        <Badge>{node.kind}</Badge>
        <h1 class="font-mono text-xl font-semibold tracking-tight">{node.name}</h1>
        {#if node.deprecated}<Badge tone="danger">deprecated</Badge>{/if}
        <Options options={node.options} />
    </div>
    <p class="mt-1 font-mono text-xs break-all text-zinc-500">{node.fqn}</p>
    <p class="mt-0.5 font-mono text-xs text-zinc-500">
        {node.file}{#if node.parent}
            &middot; nested in
            <a class="text-sky-700 hover:underline dark:text-sky-400" href={typeHref(node.parent)}
                >{shortName(node.parent)}</a
            >
        {/if}
    </p>
    <div class="mt-4 max-w-3xl">
        <Comments comments={node.comments} />
    </div>
</header>

{#if node.kind === 'message'}
    <section class="mt-7">
        <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Fields</h2>
        <div class="max-w-5xl">
            <MessageInline message={node} related={data.related} anchors />
        </div>
    </section>

    {#if node.oneofs.length}
        <section class="mt-7">
            <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Oneofs</h2>
            <ul class="space-y-2 text-sm">
                {#each node.oneofs as oneof (oneof.name)}
                    <li>
                        <span class="font-mono text-[13px]">{oneof.name}</span>
                        <span class="font-mono text-xs text-zinc-500"
                            >{oneof.fields.join(' | ')}</span
                        >
                        <div class="max-w-3xl"><Comments comments={oneof.comments} compact /></div>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if node.reservedRanges.length || node.reservedNames.length}
        <section class="mt-7">
            <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Reserved</h2>
            <p class="font-mono text-[13px] text-zinc-500">
                {[
                    ...node.reservedRanges.map(range),
                    ...node.reservedNames.map((n) => `"${n}"`)
                ].join(', ')}
            </p>
        </section>
    {/if}

    {#if node.nestedMessages.length || node.nestedEnums.length}
        <section class="mt-7">
            <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Nested</h2>
            <ul class="space-y-0.5 font-mono text-[13px]">
                {#each [...node.nestedMessages, ...node.nestedEnums] as fqn (fqn)}
                    <li>
                        <a
                            class="text-sky-700 hover:underline dark:text-sky-400"
                            href={typeHref(fqn)}>{shortName(fqn)}</a
                        >
                    </li>
                {/each}
            </ul>
        </section>
    {/if}
{:else if node.kind === 'enum'}
    <section class="mt-7">
        <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Values</h2>
        <div class="max-w-5xl">
            {#each node.values as value (value.name)}
                <div
                    class="group border-b border-zinc-100 py-1.5 dark:border-zinc-900"
                    id={value.name}
                >
                    <div class="flex flex-wrap items-baseline gap-x-2">
                        <span class="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-400">
                            {value.number}
                        </span>
                        <span
                            class="font-mono text-[13px] {value.deprecated ? 'line-through' : ''}"
                        >
                            {value.name}
                        </span>
                        {#if value.deprecated}<Badge tone="danger">deprecated</Badge>{/if}
                        <Options options={value.options} />
                        <a
                            href="#{value.name}"
                            aria-label="Link to {value.name}"
                            class="font-mono text-[11px] text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-sky-600 focus:opacity-100 dark:text-zinc-600"
                            >#</a
                        >
                    </div>
                    {#if hasComments(value.comments)}
                        <div class="max-w-3xl pl-7">
                            <Comments comments={value.comments} compact />
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
        {#if node.allowAlias}
            <p class="mt-2 font-mono text-xs text-zinc-500">allow_alias = true</p>
        {/if}
    </section>
{:else}
    <section class="mt-7">
        <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Methods</h2>
        <ul class="max-w-5xl space-y-5">
            {#each node.methods as method (method.name)}
                <li class="border-b border-zinc-100 pb-4 dark:border-zinc-900">
                    <MethodCard {method} related={data.related} />
                </li>
            {/each}
        </ul>
    </section>
{/if}

{#if data.xrefs.length}
    <section class="mt-7">
        <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Used by</h2>
        <ul class="space-y-1 text-sm">
            {#each data.xrefs as ref (ref.label + ref.role)}
                <li class="font-mono text-[13px]">
                    <a
                        class="text-sky-700 hover:underline dark:text-sky-400"
                        href={typeHref(ref.from)}>{ref.label}</a
                    >
                    <span class="text-zinc-400">{ref.role.replace('_', ' ')}</span>
                </li>
            {/each}
        </ul>
    </section>
{/if}
