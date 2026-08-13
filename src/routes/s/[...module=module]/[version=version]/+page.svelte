<script lang="ts">
    import { resolve } from '$app/paths';
    import Badge from '$lib/components/Badge.svelte';
    import Meta from '$lib/components/Meta.svelte';
    import { pageTitle } from '$lib/meta';
    import Comments from '$lib/components/Comments.svelte';
    import { shortName } from '$lib/ir';
    import { typeHref } from '$lib/links';
    import { BREAKING_ARTIFACT_TYPE, isSignature } from '$lib/report';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

    const count = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`;
</script>

<Meta
    title={pageTitle(`${data.module}:${data.version}`)}
    description="{data.counts.symbols} symbols in {data.counts.files} files.{data.info.packages
        .length
        ? ' Packages: ' + data.info.packages.join(', ') + '.'
        : ''}"
/>

<header class="mb-8">
    <h1 class="font-mono text-xl font-semibold tracking-tight">
        {data.module}<span class="text-zinc-400">:</span>{data.version}
    </h1>

    <dl class="mt-2 grid max-w-3xl grid-cols-[auto_1fr] gap-x-4 font-mono text-xs text-zinc-500">
        <dt>digest</dt>
        <dd class="break-all">{data.info.digest}</dd>
        <dt>schema</dt>
        <dd>
            <a
                class="text-sky-700 hover:underline dark:text-sky-400"
                href={resolve('/s/[...module=module]/[version=version]/schema.binpb', {
                    module: data.module,
                    version: data.version
                })}>descriptor set</a
            >
            <span class="text-zinc-400">&middot; grpcurl -protoset, buf curl --schema</span>
        </dd>
        {#if data.info.created}
            <dt>built</dt>
            <dd>{data.info.created}</dd>
        {/if}
        {#if data.info.revision && data.info.revision !== 'unknown'}
            <dt>revision</dt>
            <dd class="break-all">{data.info.revision}</dd>
        {/if}
        {#if data.info.source}
            <dt>source</dt>
            <dd class="break-all">{data.info.source}</dd>
        {/if}
    </dl>
</header>

{#if data.referrers.length}
    <section class="mb-8 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <h2 class="mb-2 text-[11px] tracking-wide text-zinc-400 uppercase">Attached</h2>
        <ul class="max-w-3xl space-y-3">
            {#each data.referrers as ref (ref.digest)}
                <li>
                    {#if isSignature(ref.artifactType)}
                        {@const v = ref.verdict}
                        <div
                            class="flex flex-wrap items-baseline gap-x-2"
                            title="{ref.artifactType} · {kb(ref.size)}"
                        >
                            <span class="text-sm font-semibold">Signature</span>
                            {#if v?.status === 'verified'}
                                <Badge tone="accent">verified</Badge>
                                <span class="font-mono text-xs text-zinc-500">
                                    {v.key?.label ?? v.key?.id}{v.key?.module === '*'
                                        ? ' (any module)'
                                        : ''}
                                </span>
                            {:else if v?.status === 'untrusted'}
                                <Badge tone="warn">not trusted</Badge>
                            {:else if v?.status === 'invalid'}
                                <Badge tone="danger">invalid</Badge>
                            {:else}
                                <Badge>unverifiable</Badge>
                            {/if}
                            {#if ref.annotations['org.opencontainers.image.created']}
                                <span class="font-mono text-xs text-zinc-400">
                                    {ref.annotations['org.opencontainers.image.created']}
                                </span>
                            {/if}
                        </div>
                        {#if v && v.status !== 'verified'}
                            <p class="mt-1 text-[13px] text-zinc-500">{v.reason}</p>
                        {/if}
                    {:else if ref.artifactType === BREAKING_ARTIFACT_TYPE}
                        <div
                            class="flex flex-wrap items-baseline gap-x-2"
                            title="{ref.artifactType} · {kb(ref.size)}"
                        >
                            <span class="text-sm font-semibold">Breaking changes</span>
                            {#if ref.annotations['ee.zentria.protoschema.against']}
                                <span class="font-mono text-xs text-zinc-500">
                                    vs {ref.annotations['ee.zentria.protoschema.against']}
                                </span>
                            {/if}
                            {#if ref.findings}
                                <span class="text-xs text-zinc-400">
                                    {ref.findings.length
                                        ? count(ref.findings.length, 'finding')
                                        : 'none'}
                                </span>
                            {/if}
                        </div>
                    {:else}
                        <div class="flex flex-wrap items-baseline gap-2">
                            <Badge tone="accent">{ref.artifactType ?? 'unknown'}</Badge>
                            <span class="font-mono text-[11px] text-zinc-400">{kb(ref.size)}</span>
                            {#each Object.entries(ref.annotations).filter( ([k]) => k.startsWith('ee.zentria') ) as [key, value] (key)}
                                <span class="font-mono text-[11px] text-zinc-500"
                                    >{key.split('.').pop()}={value}</span
                                >
                            {/each}
                        </div>
                    {/if}
                    {#if ref.findings?.length}
                        <ul class="mt-1 space-y-1">
                            {#each ref.findings as finding (finding.type + finding.path + finding.line)}
                                <li class="flex flex-wrap items-baseline gap-x-2">
                                    <Badge tone="danger">{finding.type}</Badge>
                                    {#if finding.fqn}
                                        <a
                                            href={typeHref(finding.fqn)}
                                            class="font-mono text-[12px] text-sky-700 hover:underline dark:text-sky-400"
                                            >{shortName(finding.fqn)}</a
                                        >
                                    {:else}
                                        <span class="font-mono text-[12px] break-all text-zinc-400"
                                            >{finding.path}:{finding.line}</span
                                        >
                                    {/if}
                                    <span class="text-[13px] text-zinc-600 dark:text-zinc-400"
                                        >{finding.message}</span
                                    >
                                </li>
                            {/each}
                        </ul>
                    {:else if ref.findings}
                        <p class="mt-1 text-[13px] text-zinc-500">
                            Nothing broke against {ref.annotations[
                                'ee.zentria.protoschema.against'
                            ] ?? 'the base version'}.
                        </p>
                    {:else if ref.text}
                        <pre
                            class="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[12px] whitespace-pre-wrap text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{ref.text}</pre>
                    {/if}
                </li>
            {/each}
        </ul>
    </section>
{/if}

<div class="space-y-8">
    {#each data.files as file (file.name)}
        <section class="border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <h2 class="font-mono text-sm font-semibold">{file.name}</h2>
            <p class="mt-0.5 font-mono text-xs text-zinc-500">package {file.package}</p>

            <div class="mt-3 max-w-3xl">
                <Comments comments={file.comments} />
            </div>

            {#if file.dependencies.length}
                <p class="mt-3 font-mono text-xs text-zinc-500">
                    imports {file.dependencies.join(', ')}
                </p>
            {/if}

            <!--
                Columns size to their content rather than to a third of the row.
                `grid-cols-3` is repeat(3, minmax(0, 1fr)), and a monospace
                identifier has no break opportunity, so anything longer than a
                third of the width overflowed its track and painted over the
                next column. Wrapping flex items cannot overlap, and they stack
                instead of colliding when the viewport is narrow.
            -->
            <div class="mt-4 flex flex-wrap gap-x-10 gap-y-5 text-sm">
                {#each [['Messages', file.messages], ['Enums', file.enums], ['Services', file.services]] as const as [label, fqns] (label)}
                    {#if fqns.length}
                        <div class="min-w-0">
                            <p class="mb-1 text-[11px] tracking-wide text-zinc-400 uppercase">
                                {label}
                            </p>
                            <ul class="space-y-0.5 font-mono text-[13px]">
                                {#each fqns as fqn (fqn)}
                                    <li class="break-all">
                                        <a
                                            class="text-sky-700 hover:underline dark:text-sky-400"
                                            href={typeHref(fqn)}>{shortName(fqn)}</a
                                        >
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                {/each}
            </div>
        </section>
    {/each}
</div>
