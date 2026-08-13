import { describe, expect, it } from 'vitest';
import { diffSchemas, type NodeDiff } from '$lib/diff';
import { DEMO, loadFixture } from '$lib/__fixtures__/load';

// A real v1 -> v2 change set, so these assert what buf actually produced rather
// than what a hand-built descriptor would have.
const diff = diffSchemas(loadFixture('v1'), loadFixture('v2'));
const node = (fqn: string) => diff.nodes.find((n): n is NodeDiff => n.fqn === fqn);

describe('node-level changes', () => {
    it('reports a removed message', () => {
        expect(node(`${DEMO}.LegacyCluster`)?.change).toBe('removed');
    });

    it('reports added messages', () => {
        expect(node(`${DEMO}.DeleteFleetRequest`)?.change).toBe('added');
        expect(node(`${DEMO}.DeleteFleetResponse`)?.change).toBe('added');
    });

    it('leaves untouched types out of the diff entirely', () => {
        expect(node(`${DEMO}.PingRequest`)).toBeUndefined();
    });
});

describe('member-level changes', () => {
    it('reports a field type change', () => {
        const target = node(`${DEMO}.Autoscale`)?.members.find(
            (m) => m.name === 'target_utilization'
        );

        expect(target?.change).toBe('modified');
        expect(target?.changes).toContainEqual({
            label: 'type',
            before: 'float',
            after: 'double'
        });
    });

    it('reports an added field with its number', () => {
        const created = node(`${DEMO}.Fleet`)?.members.find((m) => m.name === 'created_at');

        expect(created?.change).toBe('added');
        expect(created?.tag).toBe(14);
    });

    it('reports an added enum value', () => {
        const added = node(`${DEMO}.Status`)?.members.find((m) => m.name === 'STATUS_UNREACHABLE');
        expect(added?.change).toBe('added');
    });

    it('reports an added method and an option added to an existing one', () => {
        const service = node(`${DEMO}.FleetService`);

        expect(service?.members.find((m) => m.name === 'DeleteFleet')?.change).toBe('added');
        expect(service?.members.find((m) => m.name === 'GetFleet')?.changes).toContainEqual({
            label: '(audit)',
            before: undefined,
            after: 'true'
        });
    });
});

describe('documentation changes', () => {
    it('marks a comment-only change as docs-only', () => {
        // v2 reworded the comment on target_utilization as well as widening it,
        // so the field is not docs-only -- but a docs change is still recorded.
        const target = node(`${DEMO}.Autoscale`)?.members.find(
            (m) => m.name === 'target_utilization'
        );

        expect(target?.changes.map((c) => c.label)).toContain('docs');
        expect(target?.docsOnly).toBe(false);
    });
});

describe('counts', () => {
    it('counts each change kind', () => {
        expect(diff.counts.added).toBeGreaterThan(0);
        expect(diff.counts.removed).toBe(1);
        expect(diff.counts.added + diff.counts.removed + diff.counts.modified).toBe(
            diff.nodes.filter((n) => !n.docsOnly).length
        );
    });

    it('is empty when comparing a schema with itself', () => {
        expect(diffSchemas(loadFixture('v2'), loadFixture('v2')).nodes).toEqual([]);
    });
});
