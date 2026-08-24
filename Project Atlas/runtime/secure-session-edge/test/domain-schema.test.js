import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createPostgresRuntimeConfig, PostgresRuntime } from '../src/postgres-runtime.js';
import { FOUNDATION_MIGRATIONS, PostgresMigrationRunner, RuntimeReadiness } from '../src/migrations.js';
import { EdgeError } from '../src/errors.js';

async function fixture(migrations = FOUNDATION_MIGRATIONS) {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  const secretProvider = { getSecret: async () => 'test-password-only' };
  const base = { environment: 'test', host: 'localhost', database: 'atlas_schema_test', user: 'atlas_app', passwordSecretRef: 'test', tls: { required: false } };
  const app = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'APPLICATION' }, { secretProvider }), { PoolCtor: Pool });
  const migration = new PostgresRuntime(await createPostgresRuntimeConfig({ ...base, role: 'MIGRATION' }, { secretProvider }), { PoolCtor: Pool });
  const runner = new PostgresMigrationRunner({ runtime: migration, migrations, lock: { acquire: async () => async () => {} } });
  await runner.apply();
  return { app, migration, runner };
}

async function close(fixtureValue) { await fixtureValue.app.close(); await fixtureValue.migration.close(); }
async function reject(promise) { await assert.rejects(promise, (error) => error instanceof EdgeError); }
async function seedTenant(app, tenantId) { await app.query('INSERT INTO atlas_installation (installation_id, tenant_id) VALUES ($1, $2)', [`INSTALL-${tenantId}`, tenantId]); }
async function seedCustomer(app, tenantId, customerId) { await app.query('INSERT INTO atlas_customers (tenant_id, customer_id, company_name, normalized_name) VALUES ($1,$2,$3,$4)', [tenantId, customerId, `Customer ${customerId}`, `customer ${customerId}`]); }

test('empty database reaches domain-schema readiness and foundation upgrades forward without rewriting C migration history', async () => {
  const f = await fixture();
  assert.deepEqual(await f.runner.status(), { state: 'CURRENT', ready: true });
  const names = (await f.app.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")).rows.map((row) => row.table_name);
  for (const required of ['atlas_contacts', 'atlas_rfqs', 'atlas_quote_revisions', 'atlas_jobs', 'atlas_job_events', 'atlas_job_qr_tokens', 'atlas_invoices', 'atlas_cash_receipts', 'atlas_external_identities', 'atlas_security_audit_events']) assert.ok(names.includes(required), required);
  assert.ok(!names.includes('atlas_travelers'));
  assert.deepEqual(await new RuntimeReadiness({ runtime: f.app, migrations: f.runner, sessionStore: {} }).readiness(), { status: 'READY' });
  await close(f);

  const cOnly = await fixture([FOUNDATION_MIGRATIONS[0]]);
  const upgraded = new PostgresMigrationRunner({ runtime: cOnly.migration, lock: { acquire: async () => async () => {} } });
  assert.deepEqual(await upgraded.status(), { state: 'UPGRADE_REQUIRED', ready: false });
  assert.deepEqual(await upgraded.apply(), { state: 'CURRENT', ready: true });
  await close(cOnly);
});

test('Contact is customer-owned, archive-safe, versioned, tenant-safe and does not use email or phone as identity', async () => {
  const f = await fixture(); const a = 'TENANT-A'; const b = 'TENANT-B';
  await seedTenant(f.app, a); await seedTenant(f.app, b); await seedCustomer(f.app, a, 'CUSTOMER-A'); await seedCustomer(f.app, b, 'CUSTOMER-B');
  const contact = 'CONTACT-11111111-1111-4111-8111-111111111111';
  await f.app.query('INSERT INTO atlas_contacts (tenant_id, contact_id, customer_id, display_name, normalized_display_name, email, normalized_email, phone, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [a, contact, 'CUSTOMER-A', 'Alex Smith', 'alex smith', 'same@example.test', 'same@example.test', '555', 'ACTIVE']);
  await f.app.query('INSERT INTO atlas_contacts (tenant_id, contact_id, customer_id, display_name, normalized_display_name, email, normalized_email, phone, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [a, 'CONTACT-22222222-2222-4222-8222-222222222222', 'CUSTOMER-A', 'Alex Smith', 'alex smith', 'same@example.test', 'same@example.test', '555', 'ARCHIVED']);
  await reject(f.app.query('INSERT INTO atlas_contacts (tenant_id, contact_id, customer_id, display_name, normalized_display_name) VALUES ($1,$2,$3,$4,$5)', [a, 'CONTACT-33333333-3333-4333-8333-333333333333', 'CUSTOMER-B', 'Wrong Tenant', 'wrong tenant']));
  await reject(f.app.query('INSERT INTO atlas_contacts (tenant_id, contact_id, customer_id, display_name, normalized_display_name) VALUES ($1,$2,$3,$4,$5)', [a, 'not-a-contact-id', 'CUSTOMER-A', 'Bad ID', 'bad id']));
  await reject(f.app.query('INSERT INTO atlas_contacts (tenant_id, contact_id, customer_id, display_name, normalized_display_name) VALUES ($1,$2,$3,$4,$5)', [a, 'CONTACT-not-a-uuid', 'CUSTOMER-A', 'Bad Shape', 'bad shape']));
  const updated = await f.app.query('UPDATE atlas_contacts SET display_name = $1, version = version + 1, updated_at = NOW() WHERE tenant_id = $2 AND contact_id = $3 AND version = $4', ['Alex Smith Updated', a, contact, 1]);
  assert.equal(updated.rowCount, 1);
  const stale = await f.app.query('UPDATE atlas_contacts SET display_name = $1, version = version + 1 WHERE tenant_id = $2 AND contact_id = $3 AND version = $4', ['Stale', a, contact, 1]);
  assert.equal(stale.rowCount, 0);
  await f.app.query('UPDATE atlas_contacts SET status = $1, archived_at = NOW() WHERE tenant_id = $2 AND contact_id = $3', ['ARCHIVED', a, contact]);
  assert.equal((await f.app.query('SELECT status FROM atlas_contacts WHERE tenant_id = $1 AND contact_id = $2', [a, contact])).rows[0].status, 'ARCHIVED');
  await close(f);
});

test('RFQ and Sales Activity contact references are optional but require the same tenant and customer', async () => {
  const f = await fixture(); const t = 'TENANT-A'; await seedTenant(f.app, t); await seedCustomer(f.app, t, 'CUSTOMER-A'); await seedCustomer(f.app, t, 'CUSTOMER-B');
  const contact = 'CONTACT-44444444-4444-4444-8444-444444444444';
  await f.app.query('INSERT INTO atlas_contacts (tenant_id, contact_id, customer_id, display_name, normalized_display_name) VALUES ($1,$2,$3,$4,$5)', [t, contact, 'CUSTOMER-A', 'Contact A', 'contact a']);
  await f.app.query('INSERT INTO atlas_rfqs (tenant_id, rfq_id, customer_id, contact_id) VALUES ($1,$2,$3,$4)', [t, 'RFQ-A', 'CUSTOMER-A', contact]);
  await f.app.query('INSERT INTO atlas_rfqs (tenant_id, rfq_id, customer_id) VALUES ($1,$2,$3)', [t, 'RFQ-NO-CONTACT', 'CUSTOMER-A']);
  await reject(f.app.query('INSERT INTO atlas_rfqs (tenant_id, rfq_id, customer_id, contact_id) VALUES ($1,$2,$3,$4)', [t, 'RFQ-WRONG-CUSTOMER', 'CUSTOMER-B', contact]));
  await f.app.query('INSERT INTO atlas_sales_activities (tenant_id, sales_activity_id, customer_id, contact_id, activity_type) VALUES ($1,$2,$3,$4,$5)', [t, 'SALES-A', 'CUSTOMER-A', contact, 'CALL']);
  await f.app.query('INSERT INTO atlas_sales_activities (tenant_id, sales_activity_id, activity_type) VALUES ($1,$2,$3)', [t, 'SALES-NO-CONTACT', 'CALL']);
  await reject(f.app.query('INSERT INTO atlas_sales_activities (tenant_id, sales_activity_id, customer_id, contact_id, activity_type) VALUES ($1,$2,$3,$4,$5)', [t, 'SALES-WRONG-CUSTOMER', 'CUSTOMER-B', contact, 'CALL']));
  await close(f);
});

test('Job, append-only event and revocable QR token persist the Traveler projection without a Traveler identity', async () => {
  const f = await fixture(); const t = 'TENANT-A'; await seedTenant(f.app, t); await seedCustomer(f.app, t, 'CUSTOMER-A');
  await f.app.query('INSERT INTO atlas_jobs (tenant_id, job_id, customer_id, status) VALUES ($1,$2,$3,$4)', [t, 'JOB-A', 'CUSTOMER-A', 'RELEASED']);
  await f.app.query('INSERT INTO atlas_job_operations (tenant_id, job_operation_id, job_id, sequence_number, operation_code) VALUES ($1,$2,$3,$4,$5)', [t, 'JOB-OP-A', 'JOB-A', 10, 'CUT']);
  await f.app.query('INSERT INTO atlas_job_events (tenant_id, job_event_id, job_id, job_operation_id, event_type) VALUES ($1,$2,$3,$4,$5)', [t, 'JOB-EVENT-A', 'JOB-A', 'JOB-OP-A', 'OPERATION_STARTED']);
  await f.app.query('INSERT INTO atlas_job_qr_tokens (tenant_id, job_qr_token_id, job_id, token_hash, status) VALUES ($1,$2,$3,$4,$5)', [t, 'JOB-QR-A', 'JOB-A', 'opaque-token-hash', 'ACTIVE']);
  await reject(f.app.query('INSERT INTO atlas_job_events (tenant_id, job_event_id, job_id, event_type) VALUES ($1,$2,$3,$4)', ['TENANT-B', 'JOB-EVENT-B', 'JOB-A', 'FORGED']));
  assert.equal((await f.app.query("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name = 'atlas_travelers'")).rows[0].count, 0);
  await close(f);
});

test('tenant-safe commercial, purchasing, finance and identity relationships reject cross-tenant stitching', async () => {
  const f = await fixture(); const a = 'TENANT-A'; const b = 'TENANT-B';
  await seedTenant(f.app, a); await seedTenant(f.app, b); await seedCustomer(f.app, a, 'CUSTOMER-A'); await seedCustomer(f.app, b, 'CUSTOMER-B');
  await f.app.query('INSERT INTO atlas_quotes (tenant_id, quote_id, customer_id) VALUES ($1,$2,$3)', [a, 'QUOTE-A', 'CUSTOMER-A']);
  await f.app.query('INSERT INTO atlas_quote_revisions (tenant_id, quote_revision_id, quote_id, customer_id, revision_number) VALUES ($1,$2,$3,$4,$5)', [a, 'QUOTE-REV-A', 'QUOTE-A', 'CUSTOMER-A', 1]);
  await f.app.query('UPDATE atlas_quotes SET current_revision_id = $1 WHERE tenant_id = $2 AND quote_id = $3', ['QUOTE-REV-A', a, 'QUOTE-A']);
  await f.app.query('INSERT INTO atlas_jobs (tenant_id, job_id, customer_id, quote_id) VALUES ($1,$2,$3,$4)', [a, 'JOB-A', 'CUSTOMER-A', 'QUOTE-A']);
  await reject(f.app.query('INSERT INTO atlas_invoices (tenant_id, invoice_id, customer_id, job_id) VALUES ($1,$2,$3,$4)', [b, 'INVOICE-B', 'CUSTOMER-B', 'JOB-A']));
  await f.app.query('INSERT INTO atlas_invoices (tenant_id, invoice_id, customer_id, status, total_minor) VALUES ($1,$2,$3,$4,$5)', [a, 'INVOICE-A', 'CUSTOMER-A', 'ISSUED', 12345]);
  await f.app.query('INSERT INTO atlas_cash_receipts (tenant_id, cash_receipt_id, invoice_id, customer_id, amount_minor, received_at) VALUES ($1,$2,$3,$4,$5,NOW())', [a, 'RECEIPT-A', 'INVOICE-A', 'CUSTOMER-A', 12345]);
  await reject(f.app.query('INSERT INTO atlas_cash_receipts (tenant_id, cash_receipt_id, invoice_id, customer_id, amount_minor, received_at) VALUES ($1,$2,$3,$4,$5,NOW())', [b, 'RECEIPT-B', 'INVOICE-A', 'CUSTOMER-B', 1]));
  await close(f);
});

test('active external identity mapping is unambiguous while revoked history remains retainable', async () => {
  const f = await fixture();
  await f.app.query('INSERT INTO atlas_users (user_id, display_name) VALUES ($1,$2),($3,$4)', ['USER-A', 'A', 'USER-B', 'B']);
  await f.app.query('INSERT INTO atlas_external_identities (external_identity_id, user_id, provider, issuer, subject, status) VALUES ($1,$2,$3,$4,$5,$6)', ['IDENTITY-A', 'USER-A', 'GOOGLE', 'https://issuer.test', 'subject', 'ACTIVE']);
  await reject(f.app.query('INSERT INTO atlas_external_identities (external_identity_id, user_id, provider, issuer, subject, status) VALUES ($1,$2,$3,$4,$5,$6)', ['IDENTITY-B', 'USER-B', 'GOOGLE', 'https://issuer.test', 'subject', 'ACTIVE']));
  await f.app.query('INSERT INTO atlas_external_identities (external_identity_id, user_id, provider, issuer, subject, status) VALUES ($1,$2,$3,$4,$5,$6)', ['IDENTITY-REVOKED', 'USER-A', 'GOOGLE', 'https://issuer.test', 'subject', 'REVOKED']);
  await close(f);
});
