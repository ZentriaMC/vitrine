import { describe, expect, it } from 'vitest';
import { collectRelated } from '$lib/server/related';
import { DEMO, loadFixture } from '$lib/__fixtures__/load';

const ir = loadFixture('v2');

describe('collectRelated', () => {
    it('walks field types transitively', () => {
        const related = collectRelated(ir, [`${DEMO}.GetFleetResponse`]);

        expect(Object.keys(related)).toEqual(
            expect.arrayContaining([
                `${DEMO}.GetFleetResponse`,
                `${DEMO}.Fleet`,
                `${DEMO}.Fleet.Member`,
                `${DEMO}.Fleet.Region`
            ])
        );
    });

    it('bounds how far it walks', () => {
        // Hardware sits at depth 3 from GetFleetResponse.
        const shallow = collectRelated(ir, [`${DEMO}.GetFleetResponse`], 1);

        expect(shallow[`${DEMO}.Fleet`]).toBeDefined();
        expect(shallow[`${DEMO}.Fleet.Member.Hardware`]).toBeUndefined();
    });

    it('never includes well-known types, which are not local', () => {
        const related = collectRelated(ir, [`${DEMO}.Fleet`]);
        expect(related['google.protobuf.Timestamp']).toBeUndefined();
    });

    it('terminates on a schema that references itself', () => {
        expect(() => collectRelated(ir, Object.keys(ir.nodes), 10)).not.toThrow();
    });
});
