import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pem = (f: string) => readFileSync(new URL(`../__fixtures__/${f}`, import.meta.url), 'utf8');

/** Fresh database per test, via the store's explicit override. */
async function store() {
    const trust = await import('$lib/server/trust');
    trust.resetForTests(join(mkdtempSync(join(tmpdir(), 'vitrine-')), 'test.db'));
    return trust;
}

describe('trusted key store', () => {
    it('computes the hint cosign puts in a bundle', async () => {
        const { keyHint } = await store();
        // Taken from verificationMaterial.publicKey.hint of the real signature.
        expect(keyHint(pem('cosign.pub'))).toBe('2MWbQj7FNMu5jQvyRQMX23la0fidKk1+s8W1+OaWgTE=');
    });

    it('round-trips a key', async () => {
        const { addKey, listKeys } = await store();
        const row = await addKey({ module: 'sample', pem: pem('cosign.pub'), label: 'release' });

        expect(row.hint).toBe('2MWbQj7FNMu5jQvyRQMX23la0fidKk1+s8W1+OaWgTE=');
        expect((await listKeys('sample')).map((k) => k.label)).toEqual(['release']);
    });

    it('scopes keys to their module, and honours the wildcard', async () => {
        const { addKey, listKeys } = await store();
        await addKey({ module: 'sample', pem: pem('cosign.pub') });
        await addKey({ module: '*', pem: pem('cosign-other.pub') });

        expect(await listKeys('sample')).toHaveLength(2);
        // Another module sees only the wildcard, never sample's key.
        expect((await listKeys('other')).map((k) => k.module)).toEqual(['*']);
    });

    it('registering the same key twice is a no-op', async () => {
        const { addKey, listKeys } = await store();
        await addKey({ module: 'sample', pem: pem('cosign.pub') });
        await addKey({ module: 'sample', pem: pem('cosign.pub') });

        expect(await listKeys('sample')).toHaveLength(1);
    });

    it('removes a key, and says when there was nothing to remove', async () => {
        const { addKey, listKeys, removeKey } = await store();
        const row = await addKey({ module: 'sample', pem: pem('cosign.pub') });

        expect(await removeKey(row.id)).toBe(true);
        expect(await listKeys('sample')).toHaveLength(0);
        expect(await removeKey(row.id)).toBe(false);
    });
});
