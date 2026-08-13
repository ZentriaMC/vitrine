/**
 * Trusted signing keys, per module.
 *
 * This is the only persistent state vitrine has. Everything else is a
 * read-through cache over the registry, so the database is deliberately small
 * and boring: one table, keys in, keys out.
 *
 * A row here is a claim that a key is allowed to vouch for a module, which
 * makes the admin API the highest-value target in the system -- anyone who can
 * add a key can make any signature verify. It is expected to sit behind a
 * reverse proxy that authenticates before the request ever reaches vitrine.
 */

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { env } from '$env/dynamic/private';

export interface TrustedKeyRow {
    id: string;
    /** Module the key may vouch for, or `*` for every module. */
    module: string;
    /** PEM-encoded public key. */
    pem: string;
    /** Base64 SHA-256 of the DER SubjectPublicKeyInfo, matching cosign's hint. */
    hint: string;
    label: string | null;
    created_at: string;
}

interface Schema {
    trusted_keys: TrustedKeyRow;
}

let db: Kysely<Schema> | undefined;
let overridePath: string | undefined;

function connect(): Kysely<Schema> {
    if (db) return db;

    // Read on first use, not at module load: a module-level constant would be
    // frozen by the import cache. $env/dynamic/private is itself snapshotted at
    // server start, which is why tests get an explicit override rather than
    // setting an environment variable that would never be seen.
    const path = overridePath ?? env.VITRINE_DB ?? 'gen/vitrine.db';

    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const sqlite = new Database(path);
    // Concurrent readers alongside a writer, and durability without fsync per write.
    sqlite.pragma('journal_mode = WAL');

    db = new Kysely<Schema>({ dialect: new SqliteDialect({ database: sqlite }) });
    return db;
}

let migrated = false;

async function ready(): Promise<Kysely<Schema>> {
    const kysely = connect();
    if (migrated) return kysely;

    await kysely.schema
        .createTable('trusted_keys')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('module', 'text', (c) => c.notNull())
        .addColumn('pem', 'text', (c) => c.notNull())
        .addColumn('hint', 'text', (c) => c.notNull())
        .addColumn('label', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();

    // The same key registered twice for one module is a no-op, not two rows.
    await sql`create unique index if not exists trusted_keys_module_hint
              on trusted_keys (module, hint)`.execute(kysely);

    migrated = true;
    return kysely;
}

/**
 * cosign's `verificationMaterial.publicKey.hint` is the base64 SHA-256 of the
 * DER SubjectPublicKeyInfo, so computing it here lets a bundle be matched to a
 * key without trying every one.
 */
export function keyHint(pem: string): string {
    const der = Buffer.from(
        pem
            .replace(/-----BEGIN [^-]+-----/, '')
            .replace(/-----END [^-]+-----/, '')
            .replace(/\s+/g, ''),
        'base64'
    );
    return createHash('sha256').update(der).digest('base64');
}

export async function listKeys(module?: string): Promise<TrustedKeyRow[]> {
    const kysely = await ready();
    let query = kysely.selectFrom('trusted_keys').selectAll().orderBy('created_at');
    if (module) query = query.where('module', 'in', [module, '*']);
    return query.execute();
}

export async function addKey(input: {
    module: string;
    pem: string;
    label?: string;
}): Promise<TrustedKeyRow> {
    const kysely = await ready();

    const row: TrustedKeyRow = {
        id: crypto.randomUUID(),
        module: input.module,
        pem: input.pem.trim(),
        hint: keyHint(input.pem),
        label: input.label ?? null,
        created_at: new Date().toISOString()
    };

    await kysely
        .insertInto('trusted_keys')
        .values(row)
        .onConflict((c) => c.columns(['module', 'hint']).doNothing())
        .execute();

    const stored = await kysely
        .selectFrom('trusted_keys')
        .selectAll()
        .where('module', '=', row.module)
        .where('hint', '=', row.hint)
        .executeTakeFirst();

    return stored ?? row;
}

export async function removeKey(id: string): Promise<boolean> {
    const kysely = await ready();
    const result = await kysely.deleteFrom('trusted_keys').where('id', '=', id).executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
}

/** Test seam: drop the connection and optionally point at another database. */
export function resetForTests(path?: string): void {
    db = undefined;
    migrated = false;
    overridePath = path;
}
