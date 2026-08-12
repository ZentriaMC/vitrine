/**
 * FileDescriptorSet -> Ir.
 *
 * The descriptor set is already a fully-resolved AST: protoc did the lexing,
 * import resolution and type resolution. What is left is the part protoc does
 * not do, which is everything this file is about:
 *
 *   - flatten nesting into an FQN-keyed index
 *   - drop protoc's synthesized artefacts (map entries, `optional` oneofs)
 *   - join comments back onto the elements they describe
 *   - decode custom options into something displayable
 *   - build the reverse "used by" index, which is the whole reason to have a
 *     browser rather than a directory listing of .proto files
 */

import { createFileRegistry, getOption, hasOption, ScalarType } from '@bufbuild/protobuf';
import type {
    DescEnum,
    DescExtension,
    DescField,
    DescFile,
    DescMessage,
    DescMethod,
    DescService
} from '@bufbuild/protobuf';
import type { FileDescriptorSet } from '@bufbuild/protobuf/wkt';
import {
    type Ir,
    type IrEnum,
    type IrField,
    type IrFile,
    type IrMessage,
    type IrMethod,
    type IrOneof,
    type IrOption,
    type IrRef,
    type IrReservedRange,
    type IrService,
    type IrTypeRef
} from '$lib/ir';
import { commentsFor, FILE_COMMENT_KEY, indexSource, type SourceIndex } from './comments';

/**
 * `hasOption`/`getOption` are typed against generated extension constants. We
 * are working with runtime descriptors, so the relationship between element and
 * extendee cannot be proven statically -- we check it ourselves instead.
 */
const optionIsSet = hasOption as (element: unknown, extension: unknown) => boolean;
const optionValue = getOption as (element: unknown, extension: unknown) => unknown;

export interface NormalizeOptions {
    /**
     * Which files belong to the module, as opposed to being imports pulled in
     * for type resolution. A descriptor set built by `buf build` contains both.
     *
     * When this runs as a protoc plugin instead, `CodeGeneratorRequest.
     * file_to_generate` answers this exactly and this heuristic goes away.
     */
    isLocalFile?: (name: string) => boolean;
}

const defaultIsLocal = (name: string) => !name.startsWith('google/protobuf/');

export function normalize(fds: FileDescriptorSet, opts: NormalizeOptions = {}): Ir {
    const isLocal = opts.isLocalFile ?? defaultIsLocal;
    const registry = createFileRegistry(fds);

    const extensions: DescExtension[] = [];
    for (const desc of registry) {
        if (desc.kind === 'extension') extensions.push(desc);
    }

    const ir: Ir = { files: [], nodes: {}, xrefs: {} };
    const localTypes = new Set<string>();

    // Note `file.proto.name`, not `file.name`: protobuf-es strips the .proto
    // extension off DescFile.name because it uses it to derive codegen import
    // paths. We want the real path, since that is what buf, git and the user
    // all call the file.
    const files: DescFile[] = [];
    for (const file of registry.files) {
        if (isLocal(file.proto.name)) files.push(file);
    }

    // First pass: record which types are local, so type references can be
    // marked linkable without a second lookup in the UI.
    for (const file of files) {
        eachMessage(file, (msg) => localTypes.add(msg.typeName));
        eachEnum(file, (enm) => localTypes.add(enm.typeName));
    }

    const ctx: Ctx = { extensions, localTypes, xrefs: ir.xrefs };

    for (const file of files) {
        const source = indexSource(file.proto);
        const irFile: IrFile = {
            name: file.proto.name,
            package: file.proto.package,
            comments: commentsFor(source.comments, FILE_COMMENT_KEY),
            dependencies: file.proto.dependency,
            messages: file.messages.map((m) => m.typeName),
            enums: file.enums.map((e) => e.typeName),
            services: file.services.map((s) => s.typeName)
        };
        ir.files.push(irFile);

        eachMessage(file, (msg) => {
            ir.nodes[msg.typeName] = normalizeMessage(msg, source, ctx);
        });
        eachEnum(file, (enm) => {
            ir.nodes[enm.typeName] = normalizeEnum(enm, source, ctx);
        });
        for (const svc of file.services) {
            ir.nodes[svc.typeName] = normalizeService(svc, source, ctx);
        }
    }

    return ir;
}

interface Ctx {
    extensions: DescExtension[];
    localTypes: Set<string>;
    xrefs: Record<string, IrRef[]>;
}

/** Visits every message in a file, nested ones included, skipping map entries. */
function eachMessage(file: DescFile, fn: (msg: DescMessage) => void): void {
    const visit = (msg: DescMessage) => {
        if (msg.proto.options?.mapEntry) return;
        fn(msg);
        msg.nestedMessages.forEach(visit);
    };
    file.messages.forEach(visit);
}

function eachEnum(file: DescFile, fn: (enm: DescEnum) => void): void {
    const visit = (msg: DescMessage) => {
        if (msg.proto.options?.mapEntry) return;
        msg.nestedEnums.forEach(fn);
        msg.nestedMessages.forEach(visit);
    };
    file.enums.forEach(fn);
    file.messages.forEach(visit);
}

function normalizeMessage(msg: DescMessage, source: SourceIndex, ctx: Ctx): IrMessage {
    // protoc turns `optional string x = 1;` into a one-member oneof named `_x`.
    // protobuf-es already hides those, but a synthesized oneof is cheap to spot
    // and expensive to leak, so check anyway.
    const oneofs: IrOneof[] = msg.oneofs
        .filter((o) => !o.fields.every((f) => f.proto.proto3Optional))
        .map((o) => ({
            name: o.name,
            comments: commentsFor(source.comments, `${msg.typeName}.${o.name}`),
            fields: o.fields.map((f) => f.name)
        }));
    const oneofNames = new Set(oneofs.map((o) => o.name));

    return {
        kind: 'message',
        fqn: msg.typeName,
        name: msg.name,
        file: msg.file.proto.name,
        package: msg.file.proto.package,
        parent: msg.parent?.typeName,
        span: source.spans.get(msg.typeName),
        comments: commentsFor(source.comments, msg.typeName),
        deprecated: msg.deprecated,
        options: collectOptions(msg, 'google.protobuf.MessageOptions', ctx),
        fields: msg.fields.map((f) => normalizeField(f, msg, source, ctx, oneofNames)),
        oneofs,
        nestedMessages: msg.nestedMessages
            .filter((m) => !m.proto.options?.mapEntry)
            .map((m) => m.typeName),
        nestedEnums: msg.nestedEnums.map((e) => e.typeName),
        reservedRanges: msg.proto.reservedRange.map(normalizeRange),
        reservedNames: msg.proto.reservedName
    };
}

function normalizeField(
    field: DescField,
    parent: DescMessage,
    source: SourceIndex,
    ctx: Ctx,
    oneofNames: Set<string>
): IrField {
    const oneof = field.oneof && oneofNames.has(field.oneof.name) ? field.oneof.name : undefined;
    const type = fieldType(field, ctx);

    recordRefs(type, parent.typeName, `${parent.name}.${field.name}`, ctx);

    return {
        name: field.name,
        number: field.number,
        jsonName: field.jsonName,
        type,
        repeated: field.fieldKind === 'list',
        optional: field.proto.proto3Optional === true,
        oneof,
        deprecated: field.deprecated,
        comments: commentsFor(source.comments, `${parent.typeName}.${field.name}`),
        options: collectOptions(field, 'google.protobuf.FieldOptions', ctx)
    };
}

function fieldType(field: DescField, ctx: Ctx): IrTypeRef {
    switch (field.fieldKind) {
        case 'scalar':
            return scalarRef(field.scalar);
        case 'message':
            return messageRef(field.message, ctx);
        case 'enum':
            return enumRef(field.enum, ctx);
        case 'list':
            switch (field.listKind) {
                case 'scalar':
                    return scalarRef(field.scalar);
                case 'message':
                    return messageRef(field.message, ctx);
                case 'enum':
                    return enumRef(field.enum, ctx);
            }
            break;
        case 'map': {
            const key = scalarRef(field.mapKey);
            switch (field.mapKind) {
                case 'scalar':
                    return { kind: 'map', key, value: scalarRef(field.scalar) };
                case 'message':
                    return { kind: 'map', key, value: messageRef(field.message, ctx) };
                case 'enum':
                    return { kind: 'map', key, value: enumRef(field.enum, ctx) };
            }
        }
    }
    // Unreachable for any descriptor protoc can produce.
    return { kind: 'scalar', name: 'unknown' };
}

function scalarRef(scalar: ScalarType): IrTypeRef {
    return { kind: 'scalar', name: ScalarType[scalar].toLowerCase() };
}

function messageRef(msg: DescMessage, ctx: Ctx): IrTypeRef {
    return {
        kind: 'message',
        fqn: msg.typeName,
        name: msg.name,
        local: ctx.localTypes.has(msg.typeName)
    };
}

function enumRef(enm: DescEnum, ctx: Ctx): IrTypeRef {
    return {
        kind: 'enum',
        fqn: enm.typeName,
        name: enm.name,
        local: ctx.localTypes.has(enm.typeName)
    };
}

function normalizeEnum(enm: DescEnum, source: SourceIndex, ctx: Ctx): IrEnum {
    return {
        kind: 'enum',
        fqn: enm.typeName,
        name: enm.name,
        file: enm.file.proto.name,
        package: enm.file.proto.package,
        parent: enm.parent?.typeName,
        span: source.spans.get(enm.typeName),
        comments: commentsFor(source.comments, enm.typeName),
        deprecated: enm.deprecated,
        options: collectOptions(enm, 'google.protobuf.EnumOptions', ctx),
        allowAlias: enm.proto.options?.allowAlias === true,
        values: enm.values.map((v) => ({
            name: v.name,
            number: v.number,
            deprecated: v.deprecated,
            comments: commentsFor(source.comments, `${enm.typeName}.${v.name}`),
            options: collectOptions(v, 'google.protobuf.EnumValueOptions', ctx)
        })),
        reservedRanges: enm.proto.reservedRange.map((r) => ({ start: r.start, end: r.end })),
        reservedNames: enm.proto.reservedName
    };
}

function normalizeService(svc: DescService, source: SourceIndex, ctx: Ctx): IrService {
    return {
        kind: 'service',
        fqn: svc.typeName,
        name: svc.name,
        file: svc.file.proto.name,
        package: svc.file.proto.package,
        span: source.spans.get(svc.typeName),
        comments: commentsFor(source.comments, svc.typeName),
        deprecated: svc.deprecated,
        options: collectOptions(svc, 'google.protobuf.ServiceOptions', ctx),
        methods: svc.methods.map((m) => normalizeMethod(m, svc, source, ctx))
    };
}

function normalizeMethod(
    method: DescMethod,
    svc: DescService,
    source: SourceIndex,
    ctx: Ctx
): IrMethod {
    const input = messageRef(method.input, ctx);
    const output = messageRef(method.output, ctx);
    const label = `${svc.name}.${method.name}`;

    pushRef(ctx, method.input.typeName, { from: svc.typeName, label, role: 'request' });
    pushRef(ctx, method.output.typeName, { from: svc.typeName, label, role: 'response' });

    return {
        name: method.name,
        fqn: `${svc.typeName}.${method.name}`,
        methodKind: method.methodKind,
        input,
        output,
        deprecated: method.deprecated,
        comments: commentsFor(source.comments, `${svc.typeName}.${method.name}`),
        options: collectOptions(method, 'google.protobuf.MethodOptions', ctx)
    };
}

function normalizeRange(r: { start: number; end: number }): IrReservedRange {
    // protoc stores reserved field ranges with an exclusive end.
    return { start: r.start, end: r.end - 1 };
}

function recordRefs(type: IrTypeRef, from: string, label: string, ctx: Ctx): void {
    if (type.kind === 'map') {
        // Map keys are always scalar in practice, but the reference index does
        // not need to care which half of the entry a named type came from.
        recordRefs(type.key, from, label, ctx);
        recordRefs(type.value, from, label, ctx);
        return;
    }
    if (type.kind === 'message' || type.kind === 'enum') {
        pushRef(ctx, type.fqn, { from, label, role: 'field' });
    }
}

function pushRef(ctx: Ctx, target: string, ref: IrRef): void {
    (ctx.xrefs[target] ??= []).push(ref);
}

/**
 * Reads every custom option set on an element.
 *
 * Extensions only decode if their descriptors are in the same registry, which
 * is why the options .proto has to be part of the build rather than a dangling
 * import. Anything unregistered stays an unknown field and is skipped.
 */
function collectOptions(
    element: DescMessage | DescField | DescEnum | DescService | DescMethod | { kind: string },
    extendee: string,
    ctx: Ctx
): IrOption[] {
    const out: IrOption[] = [];
    for (const ext of ctx.extensions) {
        if (ext.extendee.typeName !== extendee) continue;
        if (!optionIsSet(element, ext)) continue;
        out.push({
            name: ext.typeName,
            shortName: ext.name,
            value: renderOptionValue(optionValue(element, ext), ext)
        });
    }
    return out;
}

function renderOptionValue(value: unknown, ext: DescExtension): string | number | boolean {
    if (ext.fieldKind === 'enum' && typeof value === 'number') {
        return ext.enum.values.find((v) => v.number === value)?.name ?? value;
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return JSON.stringify(value) ?? String(value);
}
