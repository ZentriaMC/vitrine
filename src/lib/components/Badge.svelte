<script lang="ts">
    import type { Snippet } from 'svelte';

    type Tone = 'neutral' | 'warn' | 'accent' | 'danger';

    let { tone = 'neutral', children }: { tone?: Tone; children: Snippet } = $props();

    const tones: Record<Tone, string> = {
        neutral:
            'bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700',
        accent: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
        warn: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
        danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900'
    };
</script>

<span
    class="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] leading-none ring-1 ring-inset {tones[
        tone
    ]}"
>
    {@render children()}
</span>
