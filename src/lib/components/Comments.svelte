<script lang="ts">
    import { hasComments, type IrComments } from '$lib/ir';
    import { renderMarkdown } from '$lib/markdown';

    let { comments, compact = false }: { comments: IrComments; compact?: boolean } = $props();

    // `prose` handles headings, lists and code blocks; the modifiers strip the
    // outer margins so a comment sits flush wherever it is placed, and pull code
    // back from prose's default quoting and heaviness.
    const proseClasses =
        'prose max-w-none dark:prose-invert prose-p:my-1 prose-headings:mt-3 prose-headings:mb-1 ' +
        'prose-pre:my-2 prose-pre:bg-zinc-100 prose-pre:text-zinc-800 dark:prose-pre:bg-zinc-900 ' +
        'dark:prose-pre:text-zinc-200 prose-code:before:content-none prose-code:after:content-none ' +
        'prose-ul:my-1 prose-ol:my-1 prose-li:my-0 first:prose-p:mt-0 last:prose-p:mb-0 ' +
        // Cells hold long code spans; wrap inside the cell rather than pushing
        // the table past its container.
        'prose-th:text-left prose-td:align-top prose-td:break-words prose-table:my-2';
</script>

{#if hasComments(comments)}
    <div
        class="{proseClasses} {compact
            ? 'prose-sm text-[13px] leading-snug'
            : 'prose-sm'} text-zinc-600 dark:text-zinc-400"
    >
        {#each comments.leadingDetached as para (para)}
            <div class="mb-2 text-zinc-500 italic dark:text-zinc-500">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderMarkdown(para)}
            </div>
        {/each}
        {#if comments.leading}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html renderMarkdown(comments.leading)}
        {/if}
        {#if comments.trailing}
            <div class="mt-1 text-zinc-500">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderMarkdown(comments.trailing)}
            </div>
        {/if}
    </div>
{/if}
