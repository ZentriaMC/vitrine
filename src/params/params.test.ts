import { describe, expect, it } from 'vitest';
import { match as matchModule } from './module';
import { match as matchVersion } from './version';

/**
 * These matchers exist to make the wrong route fail. `[...module]` compiles to
 * a greedy pattern and the overview route sorts ahead of the deeper ones, so
 * without them `/s/sample/v2.0.0/diff/v1.10.0` matches the overview with
 * module=`sample/v2.0.0/diff` and every sub-route 404s.
 */
describe('module matcher', () => {
    it('accepts names of any depth', () => {
        expect(matchModule('sample')).toBe(true);
        expect(matchModule('zentria/vex')).toBe(true);
        expect(matchModule('zentria/platform/edge/vex')).toBe(true);
    });

    it('rejects a name ending in a sub-route segment', () => {
        expect(matchModule('sample/v2.0.0/diff')).toBe(false);
        expect(matchModule('zentria/subvault/0.1.0/t')).toBe(false);
        expect(matchModule('a/b/services')).toBe(false);
        expect(matchModule('a/b/schema.binpb')).toBe(false);
    });

    it('allows a reserved word anywhere but the end', () => {
        // Only the trailing segment can be a sub-route boundary.
        expect(matchModule('diff/vex')).toBe(true);
    });

    it('rejects empty segments', () => {
        expect(matchModule('')).toBe(false);
        expect(matchModule('a//b')).toBe(false);
    });
});

describe('version matcher', () => {
    it('accepts tags and digests', () => {
        expect(matchVersion('v2.0.0')).toBe(true);
        expect(matchVersion('0.1.0')).toBe(true);
        expect(matchVersion('sha256:abc123')).toBe(true);
    });

    it('rejects sub-route names', () => {
        // `/s/zentria/vex/v2026.8.1/services` leaves `services` in the version
        // slot once the greedy module has swallowed the real version.
        expect(matchVersion('services')).toBe(false);
        expect(matchVersion('diff')).toBe(false);
        expect(matchVersion('t')).toBe(false);
        expect(matchVersion('schema.binpb')).toBe(false);
    });
});
