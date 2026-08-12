<script lang="ts">
    import { hasComments, type IrComments } from '$lib/ir';

    let { comments, compact = false }: { comments: IrComments; compact?: boolean } = $props();
</script>

{#if hasComments(comments)}
    <div
        class="text-zinc-600 dark:text-zinc-400 {compact
            ? 'text-[13px] leading-snug'
            : 'text-sm leading-relaxed'}"
    >
        {#each comments.leadingDetached as para (para)}
            <p class="mb-2 whitespace-pre-wrap text-zinc-500 italic dark:text-zinc-500">{para}</p>
        {/each}
        {#if comments.leading}
            <p class="whitespace-pre-wrap">{comments.leading}</p>
        {/if}
        {#if comments.trailing}
            <p class="mt-1 whitespace-pre-wrap text-zinc-500">{comments.trailing}</p>
        {/if}
    </div>
{/if}
