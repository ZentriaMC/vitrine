import { describe, expect, it } from 'vitest';
import { pageTitle, summarize } from '$lib/meta';

describe('summarize', () => {
    it('flattens a multi-line doc comment', () => {
        expect(summarize('One line.\nAnd   another.')).toBe('One line. And another.');
    });

    it('is undefined for nothing worth showing', () => {
        expect(summarize(undefined)).toBeUndefined();
        expect(summarize('   \n  ')).toBeUndefined();
    });

    it('clips on a word boundary rather than mid-word', () => {
        const clipped = summarize('alpha bravo charlie delta', 16);

        expect(clipped).toBe('alpha bravo…');
        expect(clipped!.length).toBeLessThanOrEqual(16);
    });

    it('leaves text that already fits alone', () => {
        expect(summarize('short', 200)).toBe('short');
    });
});

describe('pageTitle', () => {
    it('always ends with the site name', () => {
        expect(pageTitle()).toBe('vitrine');
        expect(pageTitle('Fleet', 'sample:v2.0.0')).toBe('Fleet · sample:v2.0.0 · vitrine');
    });

    it('drops empty parts', () => {
        expect(pageTitle(undefined, 'sample')).toBe('sample · vitrine');
    });
});
