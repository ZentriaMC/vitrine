import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '$lib/markdown';

describe('renderMarkdown', () => {
    it('renders the constructs proto docs actually use', () => {
        expect(renderMarkdown('# Heading')).toContain('<h1>');
        expect(renderMarkdown('- one\n- two')).toContain('<li>');
        expect(renderMarkdown('use `foo_bar` here')).toContain('<code>foo_bar</code>');
        expect(renderMarkdown('    indented code')).toContain('<pre>');
    });

    it('reflows hard-wrapped prose into one paragraph', () => {
        // Proto comments wrap at ~80 columns; keeping those breaks looks ragged.
        const html = renderMarkdown('one line\nand another');
        expect(html).toContain('one line\nand another');
        expect(html.match(/<p>/g)).toHaveLength(1);
    });

    it('escapes raw HTML rather than passing it through', () => {
        // A comment is whatever someone pushed to the registry. This is why no
        // sanitizer pass is needed.
        const html = renderMarkdown('<script>alert(1)</script>');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('refuses unsafe link protocols', () => {
        expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript:');
    });

    it('sends external links to a new tab, and leaves relative ones alone', () => {
        expect(renderMarkdown('[x](https://protobuf.dev)')).toContain('target="_blank"');
        expect(renderMarkdown('[x](#anchor)')).not.toContain('target="_blank"');
    });

    it('rejoins a table row that was hard-wrapped in the source', () => {
        // The row overflows 80 columns, so the cell continues on the next line.
        // Left alone, the table takes the first line only and the rest falls out
        // below, splitting the code span and leaving literal backticks.
        const wrapped = 'HTTP | gRPC\n-----|-----\nPATCH /v1/x | `Update(id:\n"1")`';
        const html = renderMarkdown(wrapped);

        expect(html).toContain('<table>');
        // Both halves of the cell are inside the same td, and the span closed.
        // Quotes arrive HTML-escaped, which is the renderer doing its job.
        expect(html).toContain('<td><code>Update(id: &quot;1&quot;)</code></td>');
        expect(html.replace(/<[^>]+>/g, '')).not.toContain('`');
    });

    it('leaves a well-formed table alone', () => {
        const html = renderMarkdown('a | b\n---|---\n1 | 2');
        expect(html).toContain('<table>');
        expect(html).toContain('<td>1</td>');
    });

    it('does not treat a dashed line inside a code block as a table', () => {
        const html = renderMarkdown('    a | b\n    ---|---\n    1 | 2');
        expect(html).toContain('<pre>');
        expect(html).not.toContain('<table>');
    });

    it('leaves identifiers with underscores intact', () => {
        // CommonMark does not italicise intra-word underscores, which matters
        // when most of the prose is field names.
        expect(renderMarkdown('field_name_here')).toContain('field_name_here');
    });
});
