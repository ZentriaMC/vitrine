import { describe, expect, it } from 'vitest';
import { countMatches, navTree, searchSymbols, symbolsInFile } from '$lib/server/nav';
import { COMPLEX, DEMO, loadFixture } from '$lib/__fixtures__/load';

const ir = loadFixture('v2');

describe('navTree', () => {
    it('carries counts instead of symbols', () => {
        const tree = navTree(ir);
        const demo = tree.find((p) => p.name === DEMO);
        const complex = demo?.files.find((f) => f.name === COMPLEX);

        expect(complex?.symbols).toBeGreaterThan(0);
        // The whole point: no symbol arrays in the layout payload.
        expect(Object.keys(complex ?? {})).toEqual(['name', 'symbols']);
    });

    it('counts every symbol exactly once across the tree', () => {
        const counted = navTree(ir)
            .flatMap((p) => p.files)
            .reduce((n, f) => n + f.symbols, 0);

        expect(counted).toBe(Object.keys(ir.nodes).length);
    });
});

describe('symbolsInFile', () => {
    it('returns only that file, with nesting depth', () => {
        const symbols = symbolsInFile(ir, COMPLEX);

        expect(symbols.every((s) => s.fqn.startsWith(DEMO))).toBe(true);
        expect(symbols.find((s) => s.name === 'Hardware')?.depth).toBe(2);
        expect(symbols.find((s) => s.name === 'Fleet')?.depth).toBe(0);
    });

    it('is empty for an unknown file', () => {
        expect(symbolsInFile(ir, 'nope.proto')).toEqual([]);
    });
});

describe('searchSymbols', () => {
    it('matches on the fully-qualified name, case-insensitively', () => {
        expect(searchSymbols(ir, 'fleetservice', 50).map((s) => s.name)).toContain('FleetService');
    });

    it('respects the limit while reporting the true total', () => {
        const all = countMatches(ir, '');
        expect(all).toBe(Object.keys(ir.nodes).length);
        expect(searchSymbols(ir, '', 3)).toHaveLength(3);
    });
});
