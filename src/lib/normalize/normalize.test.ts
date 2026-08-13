import { describe, expect, it } from 'vitest';
import { COMPLEX, DEMO, loadFixture } from '$lib/__fixtures__/load';
import type { IrEnum, IrMessage, IrService } from '$lib/ir';

const ir = loadFixture('v2');

const message = (fqn: string) => {
    const node = ir.nodes[fqn];
    expect(node?.kind, `${fqn} should be a message`).toBe('message');
    return node as IrMessage;
};

describe('file identity', () => {
    it('keeps the .proto extension', () => {
        // protobuf-es strips it from DescFile.name to derive codegen import
        // paths; the artifact, git and buf all call the file complex.proto.
        expect(ir.files.map((f) => f.name)).toContain(COMPLEX);
    });

    it('excludes imported well-known types from the browsable set', () => {
        expect(ir.files.every((f) => !f.name.startsWith('google/protobuf/'))).toBe(true);
        expect(ir.nodes['google.protobuf.Timestamp']).toBeUndefined();
    });
});

/**
 * Two of these are contract tests rather than tests of our filtering: protobuf-es
 * drops map entries and synthesized oneofs before we ever see them, which
 * mutation testing showed by removing our guards without failing anything. They
 * still earn their place -- if that library behaviour ever changes, these are
 * what catches the leak.
 */
describe('protoc artefacts stay hidden', () => {
    it('renders a map field as a map, without leaking the entry message', () => {
        const labels = message(`${DEMO}.Fleet`).fields.find((f) => f.name === 'labels');

        expect(labels?.type).toEqual({
            kind: 'map',
            key: { kind: 'scalar', name: 'string' },
            value: { kind: 'scalar', name: 'string' }
        });
        expect(ir.nodes[`${DEMO}.Fleet.LabelsEntry`]).toBeUndefined();
        expect(message(`${DEMO}.Fleet`).nestedMessages).not.toContain(`${DEMO}.Fleet.LabelsEntry`);
    });

    it('reduces proto3 optional to a flag, not a synthesized oneof', () => {
        const fleet = message(`${DEMO}.Fleet`);
        const description = fleet.fields.find((f) => f.name === 'description');

        expect(description?.optional).toBe(true);
        expect(description?.oneof).toBeUndefined();
        expect(fleet.oneofs.map((o) => o.name)).not.toContain('_description');
    });

    it('keeps a real oneof, with its members', () => {
        const fleet = message(`${DEMO}.Fleet`);
        const scaling = fleet.oneofs.find((o) => o.name === 'scaling');

        expect(scaling?.fields).toEqual(['fixed_size', 'autoscale']);
        expect(fleet.fields.find((f) => f.name === 'autoscale')?.oneof).toBe('scaling');
    });
});

describe('flattening', () => {
    it('hoists nested declarations and records their parent', () => {
        expect(message(`${DEMO}.Fleet.Member.Hardware`).parent).toBe(`${DEMO}.Fleet.Member`);
        expect(message(`${DEMO}.Fleet.Member`).parent).toBe(`${DEMO}.Fleet`);
        expect(message(`${DEMO}.Fleet`).parent).toBeUndefined();
    });

    it('lists a nested enum under its parent', () => {
        expect(message(`${DEMO}.Fleet`).nestedEnums).toContain(`${DEMO}.Fleet.Region`);
    });
});

describe('comments', () => {
    it('attaches a file header, taken from the package declaration', () => {
        const file = ir.files.find((f) => f.name === COMPLEX);
        expect(file?.comments.leading).toContain('The awkward end of the spectrum');
    });

    it('attaches a field comment to the right field', () => {
        const members = message(`${DEMO}.Fleet`).fields.find((f) => f.name === 'members');
        expect(members?.comments.leading).toBe('Machines currently in the fleet.');
    });

    it('attaches an enum value comment', () => {
        const status = ir.nodes[`${DEMO}.Status`] as IrEnum;
        const ok = status.values.find((v) => v.name === 'STATUS_OK');
        expect(ok?.comments.leading).toBe('The target answered within the deadline.');
    });
});

describe('custom options', () => {
    it('decodes a bool option on a field', () => {
        const email = message(`${DEMO}.Fleet`).fields.find((f) => f.name === 'owner_email');
        expect(email?.options).toContainEqual({
            name: 'zentria.vitrine.options.v1.pii',
            shortName: 'pii',
            value: true
        });
    });

    it('resolves an enum-valued option to its name, not its number', () => {
        const email = message(`${DEMO}.Fleet`).fields.find((f) => f.name === 'owner_email');
        const classification = email?.options.find((o) => o.shortName === 'classification');
        expect(classification?.value).toBe('CLASSIFICATION_RESTRICTED');
    });

    it('decodes options on messages and methods', () => {
        expect(message(`${DEMO}.Fleet`).options).toContainEqual(
            expect.objectContaining({ shortName: 'owner', value: 'platform-team' })
        );

        const service = ir.nodes[`${DEMO}.FleetService`] as IrService;
        const attach = service.methods.find((m) => m.name === 'Attach');
        expect(attach?.options).toContainEqual(
            expect.objectContaining({ shortName: 'auth_scope', value: 'fleet:admin' })
        );
    });
});

describe('services', () => {
    it('distinguishes all four streaming modes', () => {
        const service = ir.nodes[`${DEMO}.FleetService`] as IrService;
        const kinds = Object.fromEntries(service.methods.map((m) => [m.name, m.methodKind]));

        expect(kinds).toMatchObject({
            GetFleet: 'unary',
            ListFleets: 'server_streaming',
            ReportProbes: 'client_streaming',
            Attach: 'bidi_streaming'
        });
    });

    it('carries per-method deprecation independently of the service', () => {
        const service = ir.nodes[`${DEMO}.FleetService`] as IrService;
        expect(service.deprecated).toBe(false);
        expect(service.methods.find((m) => m.name === 'Attach')?.deprecated).toBe(true);
    });
});

describe('cross references', () => {
    it('records every inbound use of a type', () => {
        const labels = ir.xrefs[`${DEMO}.Status`]?.map((r) => r.label) ?? [];
        expect(labels).toEqual(
            expect.arrayContaining([
                'PingResponse.status',
                'Member.last_status',
                'ReportProbesRequest.status'
            ])
        );
    });

    it('records request and response roles for methods', () => {
        const roles = ir.xrefs[`${DEMO}.GetFleetRequest`]?.map((r) => r.role) ?? [];
        expect(roles).toContain('request');
    });
});

describe('positions and reserved ranges', () => {
    it('normalizes reserved ranges to an inclusive end', () => {
        // `reserved 7, 9 to 11;` -- protoc stores an exclusive end.
        expect(message(`${DEMO}.Fleet`).reservedRanges).toEqual([
            { start: 7, end: 7 },
            { start: 9, end: 11 }
        ]);
        expect(message(`${DEMO}.Fleet`).reservedNames).toEqual(['legacy_name']);
    });

    it('records a span that contains the declaration', () => {
        const span = message(`${DEMO}.Fleet`).span;
        expect(span).toBeDefined();
        expect(span!.start).toBeGreaterThan(0);
        expect(span!.end).toBeGreaterThan(span!.start);
    });
});
