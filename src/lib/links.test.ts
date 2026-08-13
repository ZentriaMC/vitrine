import { describe, expect, it } from 'vitest';
import { externalTypeHref } from '$lib/links';

describe('externalTypeHref', () => {
    it('kebab-cases multi-word type names', () => {
        // The bug this prevents: #fieldmask does not exist, #field-mask does.
        expect(externalTypeHref('google.protobuf.FieldMask')).toBe(
            'https://protobuf.dev/reference/protobuf/google.protobuf/#field-mask'
        );
    });

    it('keeps acronym runs and digits intact', () => {
        expect(externalTypeHref('google.protobuf.UInt32Value')).toContain('#uint32-value');
        expect(externalTypeHref('google.protobuf.Int64Value')).toContain('#int64-value');
    });

    it('leaves single-word names alone', () => {
        expect(externalTypeHref('google.protobuf.Timestamp')).toContain('#timestamp');
        expect(externalTypeHref('google.protobuf.Empty')).toContain('#empty');
    });

    it('does not link descriptor.proto types, documented elsewhere', () => {
        expect(externalTypeHref('google.protobuf.FieldOptions')).toBeUndefined();
        expect(externalTypeHref('google.protobuf.FileDescriptorProto')).toBeUndefined();
    });

    it('does not link our own types', () => {
        expect(externalTypeHref('zentria.vitrine.demo.v1.Fleet')).toBeUndefined();
    });
});
