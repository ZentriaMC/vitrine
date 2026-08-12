/**
 * The normalized intermediate representation the UI renders.
 *
 * Design rules, in rough order of how much they matter:
 *
 *  1. Every addressable thing is keyed by its fully-qualified name, with the
 *     leading dot stripped: `zentria.vitrine.demo.v1.Fleet`. That single string
 *     is simultaneously the map key, the URL and the cross-link target.
 *  2. Nesting is flattened. `Fleet.Member.Hardware` is a top-level entry in
 *     `nodes`; `parent` records where it came from so the UI can still show a
 *     tree.
 *  3. Nothing protoc synthesized leaks through: map entry messages and the
 *     single-member oneofs behind proto3 `optional` are resolved away here, not
 *     in the UI.
 *  4. Comments are attached to elements, not left in SourceCodeInfo.
 *  5. Every type reference is an FQN the UI can link to, plus enough metadata
 *     to render it without a second lookup.
 *
 * This is a JSON-serializable tree: no bigints, no Maps, no class instances.
 */

export interface Ir {
    /** Files authored in this module, in build order. Imports are excluded. */
    files: IrFile[];
    /** FQN -> node. The addressable index over messages, enums and services. */
    nodes: Record<string, IrNode>;
    /** FQN -> everything that points at it. Populated for referenced types. */
    xrefs: Record<string, IrRef[]>;
}

export interface IrComments {
    leading?: string;
    trailing?: string;
    /** Comment paragraphs detached from any declaration, e.g. file headers. */
    leadingDetached: string[];
}

export interface IrOption {
    /** Fully-qualified extension name, e.g. `zentria.vitrine.options.v1.pii`. */
    name: string;
    /** Short name for display, e.g. `pii`. */
    shortName: string;
    /** Rendered value. Enum values are resolved to their name. */
    value: string | number | boolean;
}

export interface IrFile {
    name: string;
    package: string;
    comments: IrComments;
    /** Imported file names, including well-known types. */
    dependencies: string[];
    /** FQNs of top-level declarations, in source order. */
    messages: string[];
    enums: string[];
    services: string[];
}

export type IrNode = IrMessage | IrEnum | IrService;

/** 1-based, inclusive line range of a declaration in its source file. */
export interface IrSpan {
    start: number;
    end: number;
}

interface IrNodeBase {
    fqn: string;
    name: string;
    file: string;
    package: string;
    /** Where the declaration sits, for resolving tool output back to a symbol. */
    span?: IrSpan;
    /** FQN of the enclosing message, for nested declarations. */
    parent?: string;
    comments: IrComments;
    deprecated: boolean;
    options: IrOption[];
}

export interface IrMessage extends IrNodeBase {
    kind: 'message';
    fields: IrField[];
    /** Real oneofs only; the ones protoc synthesized for `optional` are gone. */
    oneofs: IrOneof[];
    /** FQNs of nested declarations. Map entry messages are excluded. */
    nestedMessages: string[];
    nestedEnums: string[];
    reservedRanges: IrReservedRange[];
    reservedNames: string[];
}

export interface IrReservedRange {
    start: number;
    /** Inclusive. protoc stores an exclusive end; it is normalized here. */
    end: number;
}

export interface IrOneof {
    name: string;
    comments: IrComments;
    /** Names of the fields in this oneof, in source order. */
    fields: string[];
}

export interface IrField {
    name: string;
    number: number;
    jsonName: string;
    type: IrTypeRef;
    repeated: boolean;
    /** Explicit proto3 `optional`, i.e. the field tracks presence. */
    optional: boolean;
    /** Name of the containing oneof, if this field is a real oneof member. */
    oneof?: string;
    deprecated: boolean;
    comments: IrComments;
    options: IrOption[];
}

export type IrTypeRef =
    | { kind: 'scalar'; name: string }
    | { kind: 'message'; fqn: string; name: string; local: boolean }
    | { kind: 'enum'; fqn: string; name: string; local: boolean }
    | { kind: 'map'; key: IrTypeRef; value: IrTypeRef };

export interface IrEnum extends IrNodeBase {
    kind: 'enum';
    allowAlias: boolean;
    values: IrEnumValue[];
    reservedRanges: IrReservedRange[];
    reservedNames: string[];
}

export interface IrEnumValue {
    name: string;
    number: number;
    deprecated: boolean;
    comments: IrComments;
    options: IrOption[];
}

export interface IrService extends IrNodeBase {
    kind: 'service';
    methods: IrMethod[];
}

export type IrMethodKind = 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';

export interface IrMethod {
    name: string;
    /** `package.Service.Method`, unique across the schema. */
    fqn: string;
    methodKind: IrMethodKind;
    input: IrTypeRef;
    output: IrTypeRef;
    deprecated: boolean;
    comments: IrComments;
    options: IrOption[];
}

/** The subset of the schema shipped with a page so types can be expanded inline. */
export type RelatedNodes = Record<string, IrMessage | IrEnum>;

/** One inbound reference to a type: the "used by" index. */
export interface IrRef {
    /** FQN of the message or service holding the reference. */
    from: string;
    /** Display name of the referring member, e.g. `Fleet.members`. */
    label: string;
    role: 'field' | 'request' | 'response';
}

export const EMPTY_COMMENTS: IrComments = { leadingDetached: [] };

/** `zentria.vitrine.demo.v1.Fleet.Member` -> `Member`. */
export function shortName(fqn: string): string {
    const i = fqn.lastIndexOf('.');
    return i === -1 ? fqn : fqn.slice(i + 1);
}

/**
 * The innermost declaration covering a position in a file.
 *
 * Lets `path:line` from a tool -- a `buf breaking` finding, say -- resolve back
 * to the symbol it is talking about. Innermost wins, so a position inside a
 * nested message resolves to the nested one rather than its parent.
 */
export function findNodeAt(ir: Ir, file: string, line: number): IrNode | undefined {
    let best: IrNode | undefined;

    for (const node of Object.values(ir.nodes)) {
        if (node.file !== file || !node.span) continue;
        if (line < node.span.start || line > node.span.end) continue;
        if (!best?.span || node.span.start > best.span.start) best = node;
    }

    return best;
}

/** True if a node has any documentation worth rendering. */
export function hasComments(c: IrComments): boolean {
    return Boolean(c.leading || c.trailing || c.leadingDetached.length);
}
