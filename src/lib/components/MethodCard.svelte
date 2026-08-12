<script lang="ts">
    import { untrack } from 'svelte';
    import { methodHref } from '$lib/links';
    import Badge from './Badge.svelte';
    import Comments from './Comments.svelte';
    import MessageInline from './MessageInline.svelte';
    import Options from './Options.svelte';
    import TypeRef from './TypeRef.svelte';
    import type { IrMethod, IrMethodKind, IrTypeRef, RelatedNodes } from '$lib/ir';

    let {
        method,
        related,
        open = false,
        linkTitle = true
    }: {
        method: IrMethod;
        related: RelatedNodes;
        /** Start with the request and response shapes expanded. */
        open?: boolean;
        /** Link the method name to its own page. Off when already on it. */
        linkTitle?: boolean;
    } = $props();

    // `open` seeds the initial state and is not tracked afterwards: once a
    // reader has toggled a card, re-renders must not snap it back.
    let shown = $state(untrack(() => open));

    const streaming: Record<IrMethodKind, string> = {
        unary: 'unary',
        server_streaming: 'server stream',
        client_streaming: 'client stream',
        bidi_streaming: 'bidi stream'
    };

    const message = (type: IrTypeRef) => (type.kind === 'message' ? related[type.fqn] : undefined);

    let input = $derived(message(method.input));
    let output = $derived(message(method.output));
</script>

<div id={method.name} class="group">
    <div class="flex flex-wrap items-center gap-2">
        {#if linkTitle}
            <a
                href={methodHref(method.fqn)}
                class="font-mono text-[15px] text-sky-700 hover:underline dark:text-sky-400 {method.deprecated
                    ? 'line-through'
                    : ''}"
            >
                {method.name}
            </a>
        {:else}
            <span class="font-mono text-[15px] {method.deprecated ? 'line-through' : ''}">
                {method.name}
            </span>
        {/if}
        <Badge tone={method.methodKind === 'unary' ? 'neutral' : 'accent'}>
            {streaming[method.methodKind]}
        </Badge>
        {#if method.deprecated}<Badge tone="danger">deprecated</Badge>{/if}
        <Options options={method.options} />
        <a
            href="#{method.name}"
            aria-label="Link to {method.name}"
            class="font-mono text-[11px] text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-sky-600 focus:opacity-100 dark:text-zinc-600"
            >#</a
        >
    </div>

    <p class="mt-1 font-mono text-[13px]">
        <TypeRef type={method.input} />
        <span class="text-zinc-400">&rarr;</span>
        <TypeRef type={method.output} />
    </p>

    <div class="mt-2 max-w-3xl"><Comments comments={method.comments} compact /></div>

    {#if input || output}
        <button
            type="button"
            onclick={() => (shown = !shown)}
            aria-expanded={shown}
            class="mt-2 font-mono text-[11px] text-zinc-500 hover:text-sky-600"
        >
            {shown ? '− hide shapes' : '+ show shapes'}
        </button>

        {#if shown}
            <div class="mt-2 space-y-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                {#if input}
                    <div>
                        <p class="mb-1 font-mono text-[11px] tracking-wide text-zinc-400 uppercase">
                            request &middot; {input.name}
                        </p>
                        {#if input.kind === 'message'}
                            <MessageInline message={input} {related} />
                        {/if}
                    </div>
                {/if}
                {#if output}
                    <div>
                        <p class="mb-1 font-mono text-[11px] tracking-wide text-zinc-400 uppercase">
                            response &middot; {output.name}
                        </p>
                        {#if output.kind === 'message'}
                            <MessageInline message={output} {related} />
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    {/if}
</div>
