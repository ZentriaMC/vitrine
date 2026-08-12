<script lang="ts">
    import Badge from './Badge.svelte';
    import type { IrOption } from '$lib/ir';

    let { options }: { options: IrOption[] } = $props();
</script>

{#if options.length}
    <span class="inline-flex flex-wrap gap-1">
        {#each options as opt (opt.name)}
            <Badge tone="accent">
                <span title={opt.name}>({opt.shortName}) = {opt.value}</span>
            </Badge>
        {/each}
    </span>
{/if}
