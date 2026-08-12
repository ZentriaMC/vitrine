/**
 * Doc comments and source positions.
 *
 * Neither lives on descriptors. Both live in `FileDescriptorProto.
 * sourceCodeInfo.location[]`, each keyed by a `path` of field numbers into the
 * FileDescriptorProto itself. `[4, 0, 2, 1]` means `message_type[0].field[1]`,
 * because `message_type` is field 4 of FileDescriptorProto and `field` is field
 * 2 of DescriptorProto.
 *
 * So the job is: walk the raw descriptor tree emitting the same paths protoc
 * did, and join on them. We key the result by fully-qualified name rather than
 * by path, so the main normalizer never has to think about paths or indices at
 * all -- it just asks for what belongs to a symbol.
 *
 * `protoc` needs `--include_source_info` for any of this to exist; `buf build`
 * includes it unless you pass `--exclude-source-info`.
 */

import type { FileDescriptorProto, DescriptorProto } from '@bufbuild/protobuf/wkt';
import { EMPTY_COMMENTS, type IrComments, type IrSpan } from '$lib/ir';

// Field numbers within FileDescriptorProto.
const FILE_PACKAGE = 2;
const FILE_MESSAGE_TYPE = 4;
const FILE_ENUM_TYPE = 5;
const FILE_SERVICE = 6;

// Field numbers within DescriptorProto.
const MSG_FIELD = 2;
const MSG_NESTED_TYPE = 3;
const MSG_ENUM_TYPE = 4;
const MSG_ONEOF_DECL = 8;

// Field numbers within EnumDescriptorProto / ServiceDescriptorProto.
const ENUM_VALUE = 2;
const SERVICE_METHOD = 2;

export type CommentIndex = Map<string, IrComments>;
export type SpanIndex = Map<string, IrSpan>;

/**
 * Everything SourceCodeInfo knows about a file, keyed by fully-qualified name.
 *
 * Members are keyed as `<parent FQN>.<member name>` -- `Fleet.members`,
 * `Status.STATUS_OK`, `FleetService.GetFleet`. That is unambiguous because
 * protobuf gives every declaration inside a scope a single shared namespace,
 * so a field can never share a name with a nested type.
 *
 * The file itself is keyed by `#file`, taken from the `package` declaration --
 * which is where protoc parks a file header comment.
 */
export interface SourceIndex {
    comments: CommentIndex;
    spans: SpanIndex;
}

export const FILE_COMMENT_KEY = '#file';

export function indexSource(file: FileDescriptorProto): SourceIndex {
    const paths = new Map<string, number[]>();
    const record = (path: number[], key: string) => paths.set(key, path);

    const pkg = file.package ? `${file.package}.` : '';
    record([FILE_PACKAGE], FILE_COMMENT_KEY);

    file.messageType.forEach((msg, i) => {
        walkMessage(msg, [FILE_MESSAGE_TYPE, i], `${pkg}${msg.name}`, record);
    });

    file.enumType.forEach((enm, i) => {
        const fqn = `${pkg}${enm.name}`;
        record([FILE_ENUM_TYPE, i], fqn);
        enm.value.forEach((v, j) => record([FILE_ENUM_TYPE, i, ENUM_VALUE, j], `${fqn}.${v.name}`));
    });

    file.service.forEach((svc, i) => {
        const fqn = `${pkg}${svc.name}`;
        record([FILE_SERVICE, i], fqn);
        svc.method.forEach((m, j) =>
            record([FILE_SERVICE, i, SERVICE_METHOD, j], `${fqn}.${m.name}`)
        );
    });

    const commentsByPath = new Map<string, IrComments>();
    const spansByPath = new Map<string, IrSpan>();

    for (const loc of file.sourceCodeInfo?.location ?? []) {
        const key = loc.path.join('.');

        const span = toSpan(loc.span);
        // Several locations share a path; the first is the declaration itself.
        if (span && !spansByPath.has(key)) spansByPath.set(key, span);

        if (!loc.leadingComments && !loc.trailingComments && !loc.leadingDetachedComments.length) {
            continue;
        }
        commentsByPath.set(key, {
            leading: clean(loc.leadingComments),
            trailing: clean(loc.trailingComments),
            leadingDetached: loc.leadingDetachedComments.map((c) => clean(c) ?? '').filter(Boolean)
        });
    }

    const comments: CommentIndex = new Map();
    const spans: SpanIndex = new Map();
    for (const [key, path] of paths) {
        const joined = path.join('.');
        const c = commentsByPath.get(joined);
        if (c) comments.set(key, c);
        const s = spansByPath.get(joined);
        if (s) spans.set(key, s);
    }

    return { comments, spans };
}

/**
 * A span is `[startLine, startCol, endCol]` on one line, or
 * `[startLine, startCol, endLine, endCol]` across several. Lines are 0-based
 * here and 1-based everywhere humans and buf look at them.
 */
function toSpan(span: number[]): IrSpan | undefined {
    if (span.length < 3) return undefined;
    const start = span[0] + 1;
    const end = (span.length >= 4 ? span[2] : span[0]) + 1;
    return { start, end };
}

function walkMessage(
    msg: DescriptorProto,
    path: number[],
    fqn: string,
    record: (path: number[], key: string) => void
): void {
    record(path, fqn);

    msg.field.forEach((f, i) => record([...path, MSG_FIELD, i], `${fqn}.${f.name}`));
    msg.oneofDecl.forEach((o, i) => record([...path, MSG_ONEOF_DECL, i], `${fqn}.${o.name}`));

    msg.enumType.forEach((enm, i) => {
        const enumFqn = `${fqn}.${enm.name}`;
        record([...path, MSG_ENUM_TYPE, i], enumFqn);
        enm.value.forEach((v, j) =>
            record([...path, MSG_ENUM_TYPE, i, ENUM_VALUE, j], `${enumFqn}.${v.name}`)
        );
    });

    msg.nestedType.forEach((nested, i) => {
        walkMessage(nested, [...path, MSG_NESTED_TYPE, i], `${fqn}.${nested.name}`, record);
    });
}

export function commentsFor(index: CommentIndex, key: string): IrComments {
    return index.get(key) ?? EMPTY_COMMENTS;
}

/**
 * protoc strips the `//` markers but keeps the leading space and the trailing
 * newline, and block comments keep their per-line indentation.
 */
function clean(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const text = raw
        .split('\n')
        .map((line) => (line.startsWith(' ') ? line.slice(1) : line))
        .join('\n')
        .trim();
    return text || undefined;
}
