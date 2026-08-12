<script lang="ts">
    import { externalTypeHref, typeHref } from '$lib/links';
    import type { IrTypeRef } from '$lib/ir';

    let { type }: { type: IrTypeRef } = $props();
</script>

{#snippet leaf(t: IrTypeRef)}
    {#if t.kind === 'scalar'}
        <span class="text-violet-600 dark:text-violet-400">{t.name}</span>
    {:else if t.kind === 'map'}
        <span class="text-zinc-400">map&lt;</span>{@render leaf(t.key)}<span class="text-zinc-400"
            >,
        </span>{@render leaf(t.value)}<span class="text-zinc-400">&gt;</span>
    {:else if t.local}
        <a
            class="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:decoration-sky-600 dark:text-sky-400 dark:decoration-sky-800"
            href={typeHref(t.fqn)}
            title={t.fqn}>{t.name}</a
        >
    {:else if externalTypeHref(t.fqn)}
        <a
            class="text-zinc-500 underline decoration-zinc-300 decoration-dotted underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
            href={externalTypeHref(t.fqn)}
            target="_blank"
            rel="noreferrer"
            title="{t.fqn} — protobuf.dev">{t.name}</a
        >
    {:else}
        <span class="text-zinc-500 dark:text-zinc-400" title={t.fqn}>{t.name}</span>
    {/if}
{/snippet}

<span class="font-mono">{@render leaf(type)}</span>
