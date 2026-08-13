/**
 * Text for link previews.
 *
 * Doc comments are the best description a schema browser has -- someone pasting
 * a type link into a chat gets the prose the author already wrote -- but they
 * arrive as multi-line prose and need flattening and clipping first.
 */
export function summarize(text: string | undefined, max = 200): string | undefined {
    const flat = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!flat) return undefined;
    if (flat.length <= max) return flat;
    // Clip on a word boundary rather than mid-word.
    return flat.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

/** `Fleet · sample:v2.0.0 · vitrine` */
export function pageTitle(...parts: (string | undefined)[]): string {
    return [...parts.filter(Boolean), 'vitrine'].join(' · ');
}
