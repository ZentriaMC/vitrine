<script lang="ts">
    import Badge from './Badge.svelte';
    import Comments from './Comments.svelte';
    import Options from './Options.svelte';
    import TypeRef from './TypeRef.svelte';
    import { hasComments, type IrEnum, type IrMessage, type IrTypeRef } from '$lib/ir';
    import type { RelatedNodes } from '$lib/ir';

    let {
        message,
        related,
        maxDepth = 3,
        anchors = false
    }: {
        message: IrMessage;
        related: RelatedNodes;
        maxDepth?: number;
        /**
         * Give top-level fields an id so they can be linked to. Only safe when
         * this message is the page subject: a method page inlines two messages,
         * and both could have a field called `name`.
         */
        anchors?: boolean;
    } = $props();

    // Keyed by field path (`…Fleet.members.hardware`) rather than by type, so
    // the same message expanded in two places tracks its own state.
    let expanded = $state<Record<string, boolean>>({});

    /** The named type a field drills into, if that type was shipped with the page. */
    function target(type: IrTypeRef): IrMessage | IrEnum | undefined {
        const named = type.kind === 'map' ? type.value : type;
        if (named.kind === 'scalar' || named.kind === 'map' || !named.local) return undefined;
        return related[named.fqn];
    }
</script>

{#snippet rows(msg: IrMessage, path: string, depth: number)}
    {#if msg.fields.length}
        <div>
            {#each msg.fields as field (field.name)}
                {@const key = `${path}.${field.name}`}
                {@const child = depth < maxDepth ? target(field.type) : undefined}
                {@const anchor = anchors && depth === 0 ? field.name : undefined}
                <div class="group py-1" id={anchor}>
                    <div class="flex flex-wrap items-baseline gap-x-2">
                        <span class="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-400">
                            {field.number}
                        </span>

                        {#if child}
                            <button
                                type="button"
                                onclick={() => (expanded[key] = !expanded[key])}
                                aria-expanded={expanded[key] === true}
                                class="w-3 shrink-0 font-mono text-[11px] text-zinc-400 hover:text-sky-600"
                            >
                                {expanded[key] ? '−' : '+'}
                            </button>
                        {:else}
                            <span class="w-3 shrink-0"></span>
                        {/if}

                        <span
                            class="font-mono text-[13px] {field.deprecated ? 'line-through' : ''}"
                        >
                            {field.name}
                        </span>
                        {#if field.repeated}
                            <span class="font-mono text-xs text-zinc-400">repeated</span>
                        {/if}
                        <TypeRef type={field.type} />

                        {#if field.optional}<Badge>optional</Badge>{/if}
                        {#if field.oneof}<Badge tone="warn">oneof {field.oneof}</Badge>{/if}
                        {#if field.deprecated}<Badge tone="danger">deprecated</Badge>{/if}
                        <Options options={field.options} />

                        {#if anchor}
                            <a
                                href="#{anchor}"
                                aria-label="Link to {field.name}"
                                class="font-mono text-[11px] text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-sky-600 focus:opacity-100 dark:text-zinc-600"
                                >#</a
                            >
                        {/if}
                    </div>

                    {#if hasComments(field.comments)}
                        <div class="max-w-2xl pl-10">
                            <Comments comments={field.comments} compact />
                        </div>
                    {/if}

                    {#if child && expanded[key]}
                        <div class="mt-1 ml-6 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                            {#if child.kind === 'message'}
                                {@render rows(child, key, depth + 1)}
                            {:else}
                                {@render enumValues(child)}
                            {/if}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <p class="text-[13px] text-zinc-500">No fields.</p>
    {/if}
{/snippet}

{#snippet enumValues(enm: IrEnum)}
    <div>
        {#each enm.values as value (value.name)}
            <div class="flex flex-wrap items-baseline gap-x-2 py-0.5">
                <span class="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-400">
                    {value.number}
                </span>
                <span class="font-mono text-[13px] {value.deprecated ? 'line-through' : ''}">
                    {value.name}
                </span>
                {#if value.comments.leading}
                    <span class="text-[13px] text-zinc-500">{value.comments.leading}</span>
                {/if}
            </div>
        {/each}
    </div>
{/snippet}

{@render rows(message, message.fqn, 0)}
