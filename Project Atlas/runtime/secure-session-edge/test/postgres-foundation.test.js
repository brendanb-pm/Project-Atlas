import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner, RuntimeReadiness } from '../src/migrations.js';
import { PostgresPersistenceProvider } from '../src/postgres-provider.js';
import { PostgresSessionStore } from '../src/postgres-session-store.js';
import { SessionService } from '../src/store.js';
import { EdgeError } from '../src/errors.js';

const scopeA = { authoritative: true, tenantId: 'TENANT-A', userId: 'USER-A' };
const scopeB = { authoritative: true, tenantId: 'TENANT-B', userId: 'USER-B' };
const policy = { idleSeconds: 1800, absoluteSeconds: 28800 };

async function fixture() {
  // pg-mem's AST coverage assertion is stricter than PostgreSQL for DDL; keep
  // it disabled only in this isolated test adapter, never in runtime code.
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true }); const { Pool } = db.adapters.createPg();
  const secretProvider = { getSecret: async () => 'test-password-only' };
  const base = { environment: 'test', host: 'localhost', database: 'atlas_test', user: 'atlas_app', passwordSecretRef: 'test', tls: { required: false }, pool: { touchIntervalMs: 1000 } };
  const app = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'APPLICATION' }, { secretProvider }), { PoolCtor: Pool });
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'MIGRATION' }, { secretProvider }), { PoolCtor: Pool });
  const lock = { acquire: async () => async () => {} }; const runner = new PostgresMigrationRunner({ runtime: migration, lock }); await runner.apply();
  return { app, migration, runner, provider: new PostgresPersistenceProvider({ runtime: app, cursorSecret: 'test-cursor-secret-at-least-16' }), sessions: new PostgresSessionStore({ runtime: app, touchIntervalMs: 1000 }) };
}
async function reject(promise, code) { await assert.rejects(promise, (error) => error instanceof EdgeError && error.code === code); }

test('PostgreSQL configuration enforces secret retrieval, production TLS and explicit roles', async () => {
  await assert.rejects(() => createPostgresRuntimeConfig({ environment: 'production', host: 'h', database: 'd', user: 'u', passwordSecretRef: 'p', tls: { required: true, rejectUnauthorized: false } }, { secretProvider: { getSecret: async () => 'x' } }));
  const config = await createPostgresRuntimeConfig({ environment: 'test', host: 'h', database: 'd', user: 'u', passwordSecretRef: 'p', tls: { required: false } }, { secretProvider: { getSecret: async () => 'x' } }); assert.equal(config.password, 'x'); assert.equal(config.role, 'APPLICATION');
});

test('migration runner creates the isolated foundation schema, is repeatable, role-gated and readiness-aware', async () => {
  const f = await fixture(); assert.deepEqual(await f.runner.status(), { state: 'CURRENT', ready: true }); assert.deepEqual(await f.runner.apply(), { state: 'CURRENT', ready: true });
  const wrong = new PostgresMigrationRunner({ runtime: f.app, lock: { acquire: async () => async () => {} } }); await reject(wrong.apply(), 'FORBIDDEN');
  const readiness = new RuntimeReadiness({ runtime: f.app, migrations: f.runner, sessionStore: f.sessions }); assert.deepEqual(await readiness.readiness(), { status: 'READY' }); await f.app.close(); await f.migration.close();
});

test('migration checksum drift and lock contention fail closed before application serving', async () => {
  const f = await fixture(); const altered = new PostgresMigrationRunner({ runtime: f.migration, migrations: [{ ...FOUNDATION_MIGRATIONS[0], checksum: 'altered-checksum' }], lock: { acquire: async () => async () => {} } }); assert.deepEqual(await altered.status(), { state: 'CHECKSUM_MISMATCH', ready: false });
  const locked = new PostgresMigrationRunner({ runtime: f.migration, lock: { acquire: async () => { throw new EdgeError('PERSISTENCE_UNAVAILABLE', 'locked', 503); } } }); await reject(locked.apply(), 'PERSISTENCE_UNAVAILABLE'); await f.app.close(); await f.migration.close();
});

test('provider contract preserves tenant scope, bounded stable paging, optimistic conflict, idempotency, append and rollback', async () => {
  const f = await fixture(); const p = f.provider;
  const a = await p.createForScope(scopeA, { id: 'record-A', name: 'A', occurredAt: '2026-01-01T00:00:00.000Z', commandId: 'command-A', requestFingerprint: 'fingerprint-A' }); assert.equal(a.record.version, 1);
  await reject(p.createForScope(scopeA, { id: 'foreign-write', tenantId: 'TENANT-B', name: 'no' }), 'FORBIDDEN');
  assert.equal((await p.createForScope(scopeA, { id: 'ignored', name: 'A', commandId: 'command-A', requestFingerprint: 'fingerprint-A' })).replayed, true);
  await reject(p.createForScope(scopeA, { id: 'conflict', commandId: 'command-A', requestFingerprint: 'fingerprint-B' }), 'CONFLICT');
  await p.createForScope(scopeA, { id: 'record-B', name: 'B', occurredAt: '2026-01-02T00:00:00.000Z' }); const page = await p.listForScope(scopeA, { limit: 1, orderBy: 'name' }); assert.equal(page.records[0].id, 'record-A'); assert.ok(page.nextCursor); assert.equal((await p.listForScope(scopeA, { limit: 1, orderBy: 'name', cursor: page.nextCursor })).records[0].id, 'record-B');
  const updated = await p.updateForScope(scopeA, 'record-A', { name: 'A2' }, { expectedVersion: 1 }); assert.equal(updated.version, 2); await reject(p.updateForScope(scopeA, 'record-A', { name: 'A3' }, { expectedVersion: 1 }), 'CONFLICT'); await reject(p.getForScope(scopeB, 'record-A'), 'NOT_FOUND');
  await reject(p.listForScope(scopeA, { limit: 201 }), 'INVALID_REQUEST'); await reject(p.listForScope(scopeA, { limit: 1, orderBy: 'name; DROP TABLE atlas_auth_sessions' }), 'INVALID_REQUEST'); await reject(p.listForScope({ tenantId: 'TENANT-A', userId: 'USER-A' }, { limit: 1 }), 'FORBIDDEN');
  await assert.rejects(() => p.runInTransaction(async (tx) => { await tx.createForScope(scopeA, { id: 'rollback', name: 'rollback' }); throw new Error('force rollback'); })); await f.app.close(); await f.migration.close();
});

test('PostgreSQL session store preserves opaque references, expiry, rotation, revocation and bounded listing', async () => {
  const f = await fixture(); let now = new Date('2099-01-01T00:00:00.000Z'); const sessions = new SessionService({ store: f.sessions, clock: () => now, policy }); const first = await sessions.create({ userId: 'USER-A', provider: 'GOOGLE', issuer: 'https://issuer', subject: 'subject', permittedTenants: ['TENANT-A'], activeTenant: 'TENANT-A' });
  const stored = await f.sessions.get(first.record.id); assert.notEqual(stored.opaqueHash, first.opaque); assert.equal((await sessions.resolve(first.opaque)).activeTenant, 'TENANT-A'); const rotated = await sessions.rotate(stored, 'TENANT-A'); await reject(sessions.resolve(first.opaque), 'SESSION_REVOKED'); assert.equal((await sessions.resolve(rotated.opaque)).id, rotated.record.id); assert.equal((await f.sessions.listActiveForUser('USER-A', { limit: 1 })).length, 1); assert.equal(await f.sessions.revokeAllForUser('USER-A'), 1); await reject(sessions.resolve(rotated.opaque), 'SESSION_REVOKED'); const expiring = await sessions.create({ userId: 'USER-B', provider: 'GOOGLE', issuer: 'https://issuer', subject: 'subject-b', permittedTenants: ['TENANT-B'], activeTenant: 'TENANT-B' }); now = new Date(now.getTime() + policy.absoluteSeconds * 1000 + 1); await reject(sessions.resolve(expiring.opaque), 'SESSION_EXPIRED'); await f.app.close(); await f.migration.close();
});

test('transaction boundary uses one acquired client and always rolls back before release', async () => {
  const calls = []; const client = { query: async (query) => { calls.push(typeof query === 'string' ? query : query.text); if (query === 'ROLLBACK') return {}; return { rows: [], rowCount: 0 }; }, release: () => calls.push('RELEASE') };
  const config = { role: 'APPLICATION', host: 'h', port: 5432, database: 'd', user: 'u', password: 'p', tls: { required: false }, pool: { max: 1, idleTimeoutMs: 1000, connectionTimeoutMs: 1000, statementTimeoutMs: 1000 } };
  const runtime = new PostgresRuntime(config, { pool: { connect: async () => client, end: async () => {} } }); await assert.rejects(() => runtime.withTransaction('TEST', async () => { throw new Error('stop'); })); assert.deepEqual(calls, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK', 'RELEASE']);
});

test('migration advisory lock remains pinned to one acquired PostgreSQL session', async () => {
  const calls = []; const client = { query: async (query) => { calls.push({ text: query.text, values: query.values }); return { rows: [{ unlocked: true }] }; }, release: () => calls.push({ text: 'RELEASE' }) };
  const config = { role: 'MIGRATION', host: 'h', port: 5432, database: 'd', user: 'u', password: 'p', tls: { required: false }, pool: { max: 2, idleTimeoutMs: 1000, connectionTimeoutMs: 1000, statementTimeoutMs: 1000 } };
  const runtime = new PostgresRuntime(config, { pool: { connect: async () => client, end: async () => {} } }); const release = await runtime.acquireAdvisoryLock('atlas-schema-migrations'); await release(); await release(); assert.deepEqual(calls.map((call) => call.text), ['SELECT pg_advisory_lock(hashtext($1))', 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', 'RELEASE']); assert(calls.slice(0, 2).every((call) => call.values[0] === 'atlas-schema-migrations'));
});

test('injection-shaped data remains bound values and malformed cursors are rejected before execution', async () => {
  const f = await fixture(); const p = f.provider; await p.createForScope(scopeA, { id: 'safe-record', name: "x'; DROP TABLE atlas_auth_sessions;--", commandId: 'cmd-safe', requestFingerprint: 'fp-safe' }); assert.equal((await p.getForScope(scopeA, 'safe-record')).name, "x'; DROP TABLE atlas_auth_sessions;--"); await reject(p.listForScope(scopeA, { limit: 1, cursor: 'not-a-cursor' }), 'INVALID_REQUEST'); await reject(p.getForScope(scopeA, "x' OR '1'='1"), 'INVALID_REQUEST'); await f.app.close(); await f.migration.close();
});
