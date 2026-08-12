/**
 * Structural diff between two normalized schemas.
 *
 * Both sides are FQN-keyed, so this is a map diff plus a member-level pass. It
 * reports what changed and deliberately does not judge whether a change is
 * breaking -- `buf breaking` already answered that in CI, and its verdict rides
 * along as an OCI referrer on the artifact. Two sources of truth for
 * breaking-ness would be one too many.
 *
 * Members are matched by name, not by number, so a rename reads as a removal
 * plus an addition while a renumber reads as one modified field. That is the
 * right default: names are what call sites use.
 */

import type { Ir, IrEnum, IrMessage, IrMethod, IrNode, IrOption, IrService, IrTypeRef } from './ir';

export type ChangeKind = 'added' | 'removed' | 'modified';

/** One before/after pair on a single property. */
export interface Change {
    label: string;
    before?: string;
    after?: string;
}

export interface MemberDiff {
    name: string;
    change: ChangeKind;
    /** Field number or enum value, when the member has one. */
    tag?: number;
    /** Rendered signature, for added and removed members. */
    signature?: string;
    changes: Change[];
    /** Nothing changed but the documentation. */
    docsOnly: boolean;
}

export interface NodeDiff {
    fqn: string;
    name: string;
    kind: IrNode['kind'];
    change: ChangeKind;
    file: string;
    changes: Change[];
    members: MemberDiff[];
    docsOnly: boolean;
}

export interface SchemaDiff {
    nodes: NodeDiff[];
    counts: { added: number; removed: number; modified: number; docsOnly: number };
}

export function diffSchemas(before: Ir, after: Ir): SchemaDiff {
    const fqns = [...new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])].sort();
    const nodes: NodeDiff[] = [];

    for (const fqn of fqns) {
        const a = before.nodes[fqn];
        const b = after.nodes[fqn];

        if (a && !b) {
            nodes.push(shell(a, 'removed'));
            continue;
        }
        if (!a && b) {
            nodes.push(shell(b, 'added'));
            continue;
        }
        if (!a || !b) continue;

        // A type that changed kind is a removal and an addition, not a change.
        if (a.kind !== b.kind) {
            nodes.push(shell(a, 'removed'), shell(b, 'added'));
            continue;
        }

        const changes = nodeChanges(a, b);
        const members = memberDiff(a, b);
        if (!changes.length && !members.length) continue;

        const docsOnly =
            changes.every((c) => c.label === 'docs') && members.every((m) => m.docsOnly);

        nodes.push({
            fqn,
            name: b.name,
            kind: b.kind,
            change: 'modified',
            file: b.file,
            changes,
            members,
            docsOnly
        });
    }

    return {
        nodes,
        counts: {
            added: nodes.filter((n) => n.change === 'added').length,
            removed: nodes.filter((n) => n.change === 'removed').length,
            modified: nodes.filter((n) => n.change === 'modified' && !n.docsOnly).length,
            docsOnly: nodes.filter((n) => n.docsOnly).length
        }
    };
}

function shell(node: IrNode, change: ChangeKind): NodeDiff {
    return {
        fqn: node.fqn,
        name: node.name,
        kind: node.kind,
        change,
        file: node.file,
        changes: [],
        members: [],
        docsOnly: false
    };
}

function nodeChanges(a: IrNode, b: IrNode): Change[] {
    const changes: Change[] = [];

    if (a.deprecated !== b.deprecated) {
        changes.push({
            label: 'deprecated',
            before: String(a.deprecated),
            after: String(b.deprecated)
        });
    }
    changes.push(...optionChanges(a.options, b.options));
    if (docs(a.comments.leading) !== docs(b.comments.leading)) {
        changes.push({ label: 'docs' });
    }

    if (a.kind === 'message' && b.kind === 'message') {
        const reservedA = reservedLabel(a);
        const reservedB = reservedLabel(b);
        if (reservedA !== reservedB) {
            changes.push({ label: 'reserved', before: reservedA, after: reservedB });
        }
    }

    return changes;
}

function memberDiff(a: IrNode, b: IrNode): MemberDiff[] {
    if (a.kind === 'message' && b.kind === 'message') return fieldDiff(a, b);
    if (a.kind === 'enum' && b.kind === 'enum') return valueDiff(a, b);
    if (a.kind === 'service' && b.kind === 'service') return methodDiff(a, b);
    return [];
}

function fieldDiff(a: IrMessage, b: IrMessage): MemberDiff[] {
    return pairByName(a.fields, b.fields, {
        signature: (f) => `${f.repeated ? 'repeated ' : ''}${typeKey(f.type)}`,
        tag: (f) => f.number,
        compare: (x, y) => {
            const changes: Change[] = [];
            if (x.number !== y.number) {
                changes.push({
                    label: 'number',
                    before: String(x.number),
                    after: String(y.number)
                });
            }
            if (typeKey(x.type) !== typeKey(y.type)) {
                changes.push({ label: 'type', before: typeKey(x.type), after: typeKey(y.type) });
            }
            if (x.repeated !== y.repeated) {
                changes.push({
                    label: 'repeated',
                    before: String(x.repeated),
                    after: String(y.repeated)
                });
            }
            if (x.optional !== y.optional) {
                changes.push({
                    label: 'optional',
                    before: String(x.optional),
                    after: String(y.optional)
                });
            }
            if (x.oneof !== y.oneof) {
                changes.push({ label: 'oneof', before: x.oneof ?? '-', after: y.oneof ?? '-' });
            }
            if (x.deprecated !== y.deprecated) {
                changes.push({
                    label: 'deprecated',
                    before: String(x.deprecated),
                    after: String(y.deprecated)
                });
            }
            changes.push(...optionChanges(x.options, y.options));
            if (docs(x.comments.leading) !== docs(y.comments.leading))
                changes.push({ label: 'docs' });
            return changes;
        }
    });
}

function valueDiff(a: IrEnum, b: IrEnum): MemberDiff[] {
    return pairByName(a.values, b.values, {
        signature: (v) => `= ${v.number}`,
        tag: (v) => v.number,
        compare: (x, y) => {
            const changes: Change[] = [];
            if (x.number !== y.number) {
                changes.push({
                    label: 'number',
                    before: String(x.number),
                    after: String(y.number)
                });
            }
            if (x.deprecated !== y.deprecated) {
                changes.push({
                    label: 'deprecated',
                    before: String(x.deprecated),
                    after: String(y.deprecated)
                });
            }
            changes.push(...optionChanges(x.options, y.options));
            if (docs(x.comments.leading) !== docs(y.comments.leading))
                changes.push({ label: 'docs' });
            return changes;
        }
    });
}

function methodDiff(a: IrService, b: IrService): MemberDiff[] {
    const signature = (m: IrMethod) => `${typeKey(m.input)} -> ${typeKey(m.output)}`;
    return pairByName(a.methods, b.methods, {
        signature,
        compare: (x, y) => {
            const changes: Change[] = [];
            if (typeKey(x.input) !== typeKey(y.input)) {
                changes.push({
                    label: 'request',
                    before: typeKey(x.input),
                    after: typeKey(y.input)
                });
            }
            if (typeKey(x.output) !== typeKey(y.output)) {
                changes.push({
                    label: 'response',
                    before: typeKey(x.output),
                    after: typeKey(y.output)
                });
            }
            if (x.methodKind !== y.methodKind) {
                changes.push({ label: 'streaming', before: x.methodKind, after: y.methodKind });
            }
            if (x.deprecated !== y.deprecated) {
                changes.push({
                    label: 'deprecated',
                    before: String(x.deprecated),
                    after: String(y.deprecated)
                });
            }
            changes.push(...optionChanges(x.options, y.options));
            if (docs(x.comments.leading) !== docs(y.comments.leading))
                changes.push({ label: 'docs' });
            return changes;
        }
    });
}

interface MemberSpec<T> {
    signature: (member: T) => string;
    tag?: (member: T) => number;
    compare: (before: T, after: T) => Change[];
}

function pairByName<T extends { name: string }>(
    before: T[],
    after: T[],
    spec: MemberSpec<T>
): MemberDiff[] {
    const beforeByName = new Map(before.map((m) => [m.name, m]));
    const afterByName = new Map(after.map((m) => [m.name, m]));
    const out: MemberDiff[] = [];

    for (const member of before) {
        if (afterByName.has(member.name)) continue;
        out.push({
            name: member.name,
            change: 'removed',
            tag: spec.tag?.(member),
            signature: spec.signature(member),
            changes: [],
            docsOnly: false
        });
    }

    for (const member of after) {
        const previous = beforeByName.get(member.name);
        if (!previous) {
            out.push({
                name: member.name,
                change: 'added',
                tag: spec.tag?.(member),
                signature: spec.signature(member),
                changes: [],
                docsOnly: false
            });
            continue;
        }

        const changes = spec.compare(previous, member);
        if (!changes.length) continue;

        out.push({
            name: member.name,
            change: 'modified',
            tag: spec.tag?.(member),
            signature: spec.signature(member),
            changes,
            docsOnly: changes.every((c) => c.label === 'docs')
        });
    }

    return out;
}

function optionChanges(before: IrOption[], after: IrOption[]): Change[] {
    const beforeByName = new Map(before.map((o) => [o.name, o]));
    const afterByName = new Map(after.map((o) => [o.name, o]));
    const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort();

    return names
        .map((name) => ({
            before: beforeByName.get(name),
            after: afterByName.get(name),
            short: (afterByName.get(name) ?? beforeByName.get(name))!.shortName
        }))
        .filter(({ before: x, after: y }) => String(x?.value) !== String(y?.value))
        .map(({ before: x, after: y, short }) => ({
            label: `(${short})`,
            before: x === undefined ? undefined : String(x.value),
            after: y === undefined ? undefined : String(y.value)
        }));
}

/** Compares types by fully-qualified name; a same-named type from another package is a change. */
function typeKey(type: IrTypeRef): string {
    switch (type.kind) {
        case 'scalar':
            return type.name;
        case 'map':
            return `map<${typeKey(type.key)}, ${typeKey(type.value)}>`;
        default:
            return type.fqn;
    }
}

function reservedLabel(m: IrMessage): string {
    return [
        ...m.reservedRanges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)),
        ...m.reservedNames.map((n) => `"${n}"`)
    ].join(', ');
}

const docs = (text: string | undefined) => (text ?? '').trim();

/** `zentria.vitrine.demo.v1.Fleet` -> `Fleet`, for display only. */
export function displayType(key: string): string {
    return key.replace(/[\w.]+\.(\w+)/g, '$1');
}
