<script lang="ts">
    import { page } from '$app/state';

    let {
        title,
        description,
        type = 'website'
    }: { title: string; description?: string; type?: string } = $props();
</script>

<!--
    No images: a schema browser has nothing to put in one, and an og:image that
    is just a logo makes previews worse, not better. `summary` is the card type
    for text-only links, and every chat client renders title + description from
    these alone.
-->
<svelte:head>
    <title>{title}</title>
    <meta property="og:site_name" content="vitrine" />
    <meta property="og:type" content={type} />
    <meta property="og:title" content={title} />
    <meta property="og:url" content={page.url.href} />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content={title} />
    {#if description}
        <meta name="description" content={description} />
        <meta property="og:description" content={description} />
        <meta name="twitter:description" content={description} />
    {/if}
</svelte:head>
