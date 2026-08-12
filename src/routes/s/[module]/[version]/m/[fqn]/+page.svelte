<script lang="ts">
    import { methodHref, typeHref } from '$lib/links';
    import Badge from '$lib/components/Badge.svelte';
    import MethodCard from '$lib/components/MethodCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let siblings = $derived(data.service.methods.filter((m) => m.name !== data.method.name));
</script>

<header class="border-b border-zinc-200 pb-5 dark:border-zinc-800">
    <div class="flex flex-wrap items-center gap-2">
        <Badge>rpc</Badge>
        <a
            href={typeHref(data.service.fqn)}
            class="font-mono text-xl text-zinc-400 hover:underline"
        >
            {data.service.name}
        </a>
        <span class="text-xl text-zinc-300 dark:text-zinc-700">/</span>
        <h1 class="font-mono text-xl font-semibold tracking-tight">{data.method.name}</h1>
    </div>
    <p class="mt-1 font-mono text-xs break-all text-zinc-500">{data.method.fqn}</p>
    <p class="mt-0.5 font-mono text-xs text-zinc-500">{data.service.file}</p>
</header>

<section class="mt-6 max-w-5xl">
    <MethodCard method={data.method} related={data.related} open linkTitle={false} />
</section>

{#if siblings.length}
    <section class="mt-8">
        <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">
            Other RPCs in {data.service.name}
        </h2>
        <ul class="space-y-0.5 font-mono text-[13px]">
            {#each siblings as method (method.name)}
                <li>
                    <a
                        href={methodHref(method.fqn)}
                        class="text-sky-700 hover:underline dark:text-sky-400 {method.deprecated
                            ? 'line-through'
                            : ''}"
                    >
                        {method.name}
                    </a>
                </li>
            {/each}
        </ul>
    </section>
{/if}
