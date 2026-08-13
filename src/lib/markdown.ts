import MarkdownIt from 'markdown-it';

/**
 * Doc comments are Markdown.
 *
 * Not by the protobuf language spec, which says nothing about comment content,
 * but by AIP-192 -- Google requires API documentation to be Markdown, and the
 * BSR renders it that way, so it is the ecosystem convention. `google.api`
 * proves it: HttpRule's comment is 272 lines opening with an ATX heading, and
 * is nonsense rendered as plain text.
 *
 * `html: false` is the security boundary. Comments come from whatever schema
 * was pushed to the registry, so raw HTML in one is escaped to text rather than
 * passed through -- which is why this needs no sanitizer pass. markdown-it also
 * rejects unsafe link protocols by default.
 */
const md = new MarkdownIt({
    html: false,
    linkify: true,
    // Proto comments are hard-wrapped at ~80 columns. Treating those newlines as
    // literal breaks would keep the ragged edge; reflowing is the point.
    breaks: false
});

// Documentation links point outwards, and losing your place in a schema to
// follow one is worse than a new tab.
const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options));

md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    // attrGet is typed as string | number | null in markdown-it's types.
    const href = String(tokens[i].attrGet('href') ?? '');
    if (/^https?:\/\//i.test(href)) {
        tokens[i].attrSet('target', '_blank');
        tokens[i].attrSet('rel', 'noreferrer');
    }
    return defaultLinkOpen(tokens, i, options, env, self);
};

/**
 * A GFM delimiter row, with optional leading and trailing pipes. Indented four
 * or more spaces it would be a code block, so the indent is bounded.
 */
const DELIMITER_ROW = /^ {0,3}\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

/**
 * Rejoins table rows that were hard-wrapped in the source.
 *
 * A GFM row has to be on one line, but proto comments wrap at ~80 columns. When
 * a row overflows, the table keeps the first physical line and the remainder
 * falls out below it as a stray paragraph -- and a code span straddling the
 * break loses its delimiters, leaving literal backticks on screen.
 *
 * Inside a table body a continuation is recognisable: it carries no column
 * separator. Joining those back onto the row above puts the content in the cell
 * it belongs to, and lets the code span close.
 */
function rejoinWrappedTableRows(source: string): string {
    const lines = source.split('\n');
    const out: string[] = [];
    let inTable = false;

    for (const line of lines) {
        if (DELIMITER_ROW.test(line)) {
            inTable = true;
            out.push(line);
            continue;
        }

        // A blank line ends the table; so does anything indented into a code block.
        if (inTable && (!line.trim() || /^ {4,}/.test(line))) inTable = false;

        if (inTable && line.trim() && !line.includes('|') && out.length) {
            out[out.length - 1] += ` ${line.trim()}`;
            continue;
        }

        out.push(line);
    }

    return out.join('\n');
}

/** Renders a doc comment to HTML. Safe to pass to `{@html}`. */
export function renderMarkdown(text: string): string {
    return md.render(rejoinWrappedTableRows(text));
}

/** Single-paragraph render, for places a block layout would not fit. */
export function renderMarkdownInline(text: string): string {
    return md.renderInline(text);
}
