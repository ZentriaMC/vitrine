/**
 * cosign signature verification, key-based.
 *
 * A cosign signature is a Sigstore bundle whose `dsseEnvelope` wraps an in-toto
 * statement naming the digest that was signed. Verifying it means three checks,
 * all of which must pass:
 *
 *   1. the DSSE signature is valid over the PAE encoding of the payload, under
 *      a key we were told to trust for this module;
 *   2. the statement's subject digest is the artifact we are looking at, so a
 *      signature cannot be lifted from one artifact onto another;
 *   3. the payload really is an in-toto statement, not something else.
 *
 * Deliberately not done here: Rekor transparency-log inclusion and keyless
 * (Fulcio certificate) verification. Both need trust roots and network calls
 * that belong in a verifier built for the job -- claiming them without doing
 * them would be worse than not claiming them.
 */

import { createHash, createPublicKey, createVerify } from 'node:crypto';
import type { TrustedKeyRow } from './trust';

export type VerdictStatus = 'verified' | 'untrusted' | 'invalid' | 'unverifiable';

export interface Verdict {
    status: VerdictStatus;
    /** Which trusted key vouched for it, when one did. */
    key?: { id: string; label: string | null; module: string };
    /** Why it is not verified, for the states that are not `verified`. */
    reason?: string;
}

interface Bundle {
    dsseEnvelope?: {
        payload?: string;
        payloadType?: string;
        signatures?: { sig?: string }[];
    };
    verificationMaterial?: { publicKey?: { hint?: string } };
}

interface Statement {
    _type?: string;
    subject?: { digest?: Record<string, string> }[];
}

/**
 * DSSE Pre-Authentication Encoding.
 *
 * The signature is over this framing rather than the bare payload, so that a
 * payload cannot be reinterpreted under a different type.
 */
function pae(payloadType: string, payload: Buffer): Buffer {
    const header = `DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} `;
    return Buffer.concat([Buffer.from(header, 'utf8'), payload]);
}

export function verifyBundle(
    bundleJson: string,
    artifactDigest: string,
    keys: TrustedKeyRow[]
): Verdict {
    let bundle: Bundle;
    try {
        bundle = JSON.parse(bundleJson) as Bundle;
    } catch {
        return { status: 'invalid', reason: 'signature bundle is not valid JSON' };
    }

    const envelope = bundle.dsseEnvelope;
    const payloadB64 = envelope?.payload;
    const payloadType = envelope?.payloadType;
    const sigB64 = envelope?.signatures?.[0]?.sig;

    if (!payloadB64 || !payloadType || !sigB64) {
        // Keyless signatures and older formats land here rather than being
        // reported as bad: we cannot check them, which is not the same as false.
        return { status: 'unverifiable', reason: 'not a key-signed DSSE bundle' };
    }

    const payload = Buffer.from(payloadB64, 'base64');
    const signed = pae(payloadType, payload);
    const signature = Buffer.from(sigB64, 'base64');

    // Check what was signed before checking who signed it: a valid signature
    // over someone else's artifact is still not a signature over this one.
    const subject = subjectDigest(payload);
    if (!subject) return { status: 'invalid', reason: 'payload is not an in-toto statement' };

    const expected = artifactDigest.replace(/^sha256:/, '');
    if (subject !== expected) {
        return { status: 'invalid', reason: `signature covers a different digest (${subject})` };
    }

    const hint = bundle.verificationMaterial?.publicKey?.hint;
    // The hint identifies the key without trying every one, but a bundle that
    // omits it still gets checked against all of them.
    const candidates = hint ? [...keys.filter((k) => k.hint === hint), ...keys] : keys;

    for (const key of candidates) {
        if (matches(signed, signature, key.pem)) {
            return {
                status: 'verified',
                key: { id: key.id, label: key.label, module: key.module }
            };
        }
    }

    return {
        status: 'untrusted',
        reason: keys.length
            ? 'signed, but not by any key trusted for this module'
            : 'no trusted keys registered for this module'
    };
}

function matches(signed: Buffer, signature: Buffer, pem: string): boolean {
    try {
        const key = createPublicKey(pem);
        // cosign signs ECDSA P-256 with SHA-256 and DER-encodes the result;
        // ed25519 takes a different path and is not what cosign emits here.
        return createVerify('SHA256').update(signed).verify(key, signature);
    } catch {
        return false;
    }
}

function subjectDigest(payload: Buffer): string | undefined {
    try {
        const statement = JSON.parse(payload.toString('utf8')) as Statement;
        if (!statement._type?.includes('in-toto.io/Statement')) return undefined;
        return statement.subject?.[0]?.digest?.sha256;
    } catch {
        return undefined;
    }
}

/** Digest of a blob, for cross-checking what a registry handed back. */
export function sha256(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
