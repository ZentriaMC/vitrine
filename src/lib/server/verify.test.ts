import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { keyHint } from '$lib/server/trust';
import { verifyBundle } from '$lib/server/verify';
import type { TrustedKeyRow } from '$lib/server/trust';

// Real `cosign sign` output against the sample artifact, plus the key that made
// it and an unrelated key. Verification is the one place a passing test against
// hand-built input would be worthless.
const read = (f: string) => readFileSync(new URL(`../__fixtures__/${f}`, import.meta.url), 'utf8');

const bundle = read('cosign-bundle.json');
const SIGNED_DIGEST = 'sha256:59906f8fb59946fb34b570c0ebed04712536fe90b2ce817096405f34438e39b0';

const key = (pem: string, module = 'sample'): TrustedKeyRow => ({
    id: `id-${keyHint(pem).slice(0, 8)}`,
    module,
    pem,
    hint: keyHint(pem),
    label: null,
    created_at: '2026-08-13T00:00:00Z'
});

const real = key(read('cosign.pub'));
const decoy = key(read('cosign-other.pub'));

describe('verifyBundle', () => {
    it('verifies a real cosign signature with the key that made it', () => {
        const verdict = verifyBundle(bundle, SIGNED_DIGEST, [real]);

        expect(verdict.status).toBe('verified');
        expect(verdict.key?.id).toBe(real.id);
    });

    it('rejects a signature when only an unrelated key is trusted', () => {
        const verdict = verifyBundle(bundle, SIGNED_DIGEST, [decoy]);

        expect(verdict.status).toBe('untrusted');
        expect(verdict.reason).toContain('not by any key trusted');
    });

    it('finds the right key among several', () => {
        expect(verifyBundle(bundle, SIGNED_DIGEST, [decoy, real]).status).toBe('verified');
    });

    it('says so when nothing is trusted yet', () => {
        const verdict = verifyBundle(bundle, SIGNED_DIGEST, []);

        expect(verdict.status).toBe('untrusted');
        expect(verdict.reason).toContain('no trusted keys');
    });

    it('refuses a signature lifted onto a different artifact', () => {
        // The signature is cryptographically fine; it just does not cover this
        // digest. Checking the subject is what stops it being replayed.
        const verdict = verifyBundle(bundle, 'sha256:' + 'ab'.repeat(32), [real]);

        expect(verdict.status).toBe('invalid');
        expect(verdict.reason).toContain('different digest');
    });

    it('rejects a tampered payload', () => {
        const parsed = JSON.parse(bundle);
        const payload = JSON.parse(
            Buffer.from(parsed.dsseEnvelope.payload, 'base64').toString('utf8')
        );
        payload.predicateType = 'https://example.invalid/tampered';
        parsed.dsseEnvelope.payload = Buffer.from(JSON.stringify(payload)).toString('base64');

        // The digest still matches, so this only fails on the signature itself.
        const verdict = verifyBundle(JSON.stringify(parsed), SIGNED_DIGEST, [real]);
        expect(verdict.status).toBe('untrusted');
    });

    it('reports what it cannot check rather than calling it bad', () => {
        // Keyless bundles have no dsseEnvelope of this shape.
        expect(verifyBundle('{}', SIGNED_DIGEST, [real]).status).toBe('unverifiable');
        expect(verifyBundle('not json', SIGNED_DIGEST, [real]).status).toBe('invalid');
    });
});
