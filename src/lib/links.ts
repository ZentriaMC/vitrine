import { resolve } from '$app/paths';
import { page } from '$app/state';

/**
 * Links within a schema inherit the module and version from the current route.
 *
 * Every cross-reference is scoped to one schema version, so threading module and
 * version through every component that renders a link -- including ones nested
 * several levels deep like TypeRef -- would be pure noise. These read the route
 * instead, which is exactly where that context already lives.
 */

const scope = () => ({
    module: page.params.module ?? '',
    version: page.params.version ?? ''
});

export function typeHref(fqn: string): string {
    return resolve('/s/[...module=module]/[version=version]/t/[fqn]', { ...scope(), fqn });
}

export function methodHref(fqn: string): string {
    return resolve('/s/[...module=module]/[version=version]/m/[fqn]', { ...scope(), fqn });
}

export function schemaHref(): string {
    return resolve('/s/[...module=module]/[version=version]', scope());
}

export function servicesHref(): string {
    return resolve('/s/[...module=module]/[version=version]/services', scope());
}

export function diffHref(against: string): string {
    return resolve('/s/[...module=module]/[version=version]/diff/[against]', {
        ...scope(),
        against
    });
}

/**
 * Types documented on protobuf.dev's well-known types page.
 *
 * A name list, not a prefix test: `google.protobuf` also holds descriptor.proto
 * -- `FieldOptions`, `FileDescriptorProto` and friends are documented elsewhere,
 * and a confidently wrong link is worse than plain text.
 */
const WELL_KNOWN = new Set([
    'Any',
    'Api',
    'BoolValue',
    'BytesValue',
    'DoubleValue',
    'Duration',
    'Empty',
    'Enum',
    'EnumValue',
    'Field',
    'FieldMask',
    'FloatValue',
    'Int32Value',
    'Int64Value',
    'ListValue',
    'Method',
    'Mixin',
    'NullValue',
    'Option',
    'SourceContext',
    'StringValue',
    'Struct',
    'Syntax',
    'Timestamp',
    'Type',
    'UInt32Value',
    'UInt64Value',
    'Value'
]);

/**
 * Anchors are the type name kebab-cased: `FieldMask` is `#field-mask`, not
 * `#fieldmask`. Splitting only where a lowercase letter or digit meets an
 * uppercase one keeps acronym-ish runs intact, so `UInt32Value` lands on
 * `#uint32-value`. Checked against all 28 anchors on the page.
 */
const anchorFor = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Canonical documentation for a type vitrine does not host itself.
 *
 * Nobody needs Timestamp's two fields rendered in a schema browser; they need
 * the upstream docs. Returns undefined for anything we cannot vouch for.
 */
export function externalTypeHref(fqn: string): string | undefined {
    const name = fqn.startsWith('google.protobuf.') ? fqn.slice('google.protobuf.'.length) : '';
    if (!WELL_KNOWN.has(name)) return undefined;
    return `https://protobuf.dev/reference/protobuf/google.protobuf/#${anchorFor(name)}`;
}
