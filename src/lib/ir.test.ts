import { describe, expect, it } from 'vitest';
import { findNodeAt, shortName } from '$lib/ir';
import { COMPLEX, DEMO, loadFixture } from '$lib/__fixtures__/load';

const ir = loadFixture('v2');

describe('findNodeAt', () => {
    it('resolves a position to the declaration containing it', () => {
        // Where buf reported FIELD_SAME_TYPE on Autoscale.target_utilization.
        expect(findNodeAt(ir, COMPLEX, 113)?.fqn).toBe(`${DEMO}.Autoscale`);
    });

    it('prefers the innermost declaration', () => {
        const hardware = ir.nodes[`${DEMO}.Fleet.Member.Hardware`];
        const line = hardware.span!.start;

        expect(findNodeAt(ir, COMPLEX, line)?.fqn).toBe(`${DEMO}.Fleet.Member.Hardware`);
    });

    it('is undefined outside any declaration', () => {
        expect(findNodeAt(ir, COMPLEX, 1)).toBeUndefined();
        expect(findNodeAt(ir, 'nope.proto', 10)).toBeUndefined();
    });
});

describe('shortName', () => {
    it('takes the last segment', () => {
        expect(shortName(`${DEMO}.Fleet.Member`)).toBe('Member');
        expect(shortName('Bare')).toBe('Bare');
    });
});
