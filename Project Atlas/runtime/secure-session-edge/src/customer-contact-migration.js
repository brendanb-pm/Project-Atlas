import { createHash } from 'node:crypto';

export const CUSTOMER_CONTACT_MIGRATION_MODES = Object.freeze(['PLAN', 'VALIDATE', 'MIGRATE', 'VERIFY', 'CUTOVER_READINESS']);
const MAX_BATCH = 200;
const MAX_ROWS = 10000;
const CONTACT_ID = /^CONTACT-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_ID = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]{1,119}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUSES = new Set(['ACTIVE', 'ARCHIVED']);
const EPOCH = '1970-01-01T00:00:00.000Z';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function text(value) { return String(value ?? '').trim(); }
function field(row, ...names) { for (const name of names) if (row?.[name] !== undefined && row[name] !== null) return row[name]; return ''; }
function iso(value) { if (!value) return EPOCH; const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date.toISOString(); }
function normalized(value) { return text(value).toLocaleLowerCase('en-US').replace(/\s+/g, ' '); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(value) { return createHash('sha256').update(stableJson(value)).digest('hex'); }
function uuidFrom(seed) {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5'; hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}
function stableId(prefix, tenantId, sourceType, sourceId) { return `${prefix}-${uuidFrom(`${tenantId}\u0000${sourceType}\u0000${sourceId}`)}`; }
function issue(severity, code, entity, sourceId, reason) { return freeze({ severity, code, entity, sourceId: text(sourceId), reason }); }
function trustedContext(context, capability) {
  if (!context?.authoritative || !SAFE_ID.test(context.tenantId || '') || !SAFE_ID.test(context.userId || '') || String(context.tenantId).startsWith('PLATFORM_')) throw new Error('Trusted tenant migration context is required.');
  if (capability && !new Set(context.capabilities || []).has(capability)) throw new Error('Migration authority is required.');
  return freeze({ tenantId: String(context.tenantId), userId: String(context.userId), authoritative: true });
}
function assertSourceTenant(row, tenantId, entity, sourceId, issues) {
  const supplied = text(field(row, 'tenantId', 'TenantID', 'securityTenantId', 'Security Tenant ID'));
  if (supplied && supplied !== tenantId) issues.push(issue('BLOCKING', 'CROSS_TENANT_SOURCE', entity, sourceId, 'Source tenant does not match the authoritative migration tenant.'));
}
function sourceIdentity(row, entity) {
  const canonicalFields = { CUSTOMER: ['CustomerID'], CONTACT: ['ContactID'], RFQ: ['RFQID'], SALES_ACTIVITY: ['SalesActivityID'] }[entity] || [];
  return text(field(row, 'sourceId', 'SourceRowID', '_sourceId', 'rowId', 'RowID', ...canonicalFields, 'id'));
}
function compatible(left, right, fields) { return fields.every((name) => String(left?.[name] ?? '') === String(right?.[name] ?? '')); }
function reconcileTargetState(plan, targetState, issues) {
  const actions = { customers: { inserts: 0, alreadyPresent: 0, conflicts: 0 }, contacts: { inserts: 0, alreadyPresent: 0, conflicts: 0 } };
  for (const [name, key, fields] of [
    ['customers', 'customerId', ['tenantId', 'customerId', 'companyName', 'normalizedName', 'primaryContactDisplay', 'email', 'phone', 'status', 'version', 'createdAt', 'updatedAt', 'archivedAt']],
    ['contacts', 'contactId', ['tenantId', 'contactId', 'customerId', 'displayName', 'normalizedDisplayName', 'email', 'normalizedEmail', 'phone', 'titleRole', 'status', 'version', 'createdAt', 'updatedAt', 'archivedAt']]
  ]) {
    const existing = new Map((targetState?.[name] || []).map((row) => [row[key], row]));
    for (const row of plan[name]) { const prior = existing.get(row[key]); if (!prior) actions[name].inserts += 1; else if (compatible(prior, row, fields)) actions[name].alreadyPresent += 1; else { actions[name].conflicts += 1; issues.push(issue('BLOCKING', 'TARGET_CONFLICT', name.toUpperCase(), row.sourceId, 'Existing canonical target data conflicts with the source plan.')); } }
  }
  for (const row of targetState?.foreignTenant || []) issues.push(issue('BLOCKING', 'FOREIGN_TENANT_TARGET', 'TARGET', row.customerId || row.contactId, 'Unexpected foreign-tenant target evidence was returned.'));
  return freeze(actions);
}

/** Bounded immutable source-export reader. A production Sheets exporter supplies readChunk; this class never writes Sheets. */
export class LegacyCustomerContactSourceReader {
  constructor({ readChunk, batchSize = 100, maxRows = MAX_ROWS } = {}) {
    if (typeof readChunk !== 'function' || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH || !Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_ROWS) throw new Error('Bounded source reader configuration is invalid.');
    this.readChunk = readChunk; this.batchSize = batchSize; this.maxRows = maxRows;
  }
  async read(context) {
    const scope = trustedContext(context); const snapshot = { customers: [], contacts: [], rfqs: [], salesActivities: [] }; const cursors = new Set(); let cursor = null; let total = 0;
    do {
      let chunk; try { chunk = await this.readChunk({ tenantId: scope.tenantId, cursor, limit: this.batchSize }); } catch { throw new Error('Bounded source export is unavailable.'); }
      for (const name of Object.keys(snapshot)) {
        if (!Array.isArray(chunk?.[name]) || chunk[name].length > this.batchSize) throw new Error('Source chunk is invalid or unbounded.');
        snapshot[name].push(...chunk[name].map((row) => freeze({ ...row })));
        total += chunk[name].length;
      }
      if (total > this.maxRows) throw new Error('Source export exceeds the configured migration bound.');
      const next = chunk?.nextCursor ? String(chunk.nextCursor) : null;
      if (next && (next.length > 512 || cursors.has(next))) throw new Error('Source cursor is invalid.');
      if (next) cursors.add(next); cursor = next;
    } while (cursor);
    return freeze({ ...snapshot, sourceFingerprint: fingerprint(snapshot), sourceRows: total });
  }
}

export class CustomerContactMigration {
  constructor({ sourceReader, target, installationReadiness, installationPrerequisites, cutoverControl = null, clock = () => new Date(), softwareVersion = 'UNKNOWN' } = {}) {
    if (!sourceReader?.read || !target?.inspect || !target?.migrate || !target?.verify || !installationReadiness?.inspect || typeof installationPrerequisites !== 'function') throw new Error('Customer/Contact migration configuration is incomplete.');
    this.sourceReader = sourceReader; this.target = target; this.installationReadiness = installationReadiness; this.installationPrerequisites = installationPrerequisites; this.cutoverControl = cutoverControl; this.clock = clock; this.softwareVersion = softwareVersion;
  }
  async run(mode, context, options = {}) {
    mode = String(mode || '').toUpperCase(); if (!CUSTOMER_CONTACT_MIGRATION_MODES.includes(mode)) throw new Error('Migration mode is invalid.');
    const scope = trustedContext(context, mode === 'MIGRATE' ? 'CUSTOMER_CONTACT_MIGRATE' : null);
    if (mode === 'MIGRATE') return this.migrate(scope, context, options);
    const plan = await this.plan(scope, options);
    if (mode === 'PLAN') return this.report('PLAN', plan, null);
    if (mode === 'VALIDATE') return this.report('VALIDATE', plan, null);
    const verification = await this.target.verify(plan, scope);
    if (mode === 'VERIFY') return this.report('VERIFY', plan, verification);
    return this.cutoverReadiness(scope, plan, verification);
  }
  async plan(scope, options = {}) {
    const snapshot = await this.sourceReader.read(scope); const issues = []; const customers = []; const contacts = []; const contactMappings = new Map(); const customerMappings = new Map();
    const rememberCustomer = (key, customerId) => { if (!key || !customerId) return; const ids = customerMappings.get(key) || new Set(); ids.add(customerId); customerMappings.set(key, ids); };
    for (const row of snapshot.customers) {
      const before = issues.length; const sourceId = sourceIdentity(row, 'CUSTOMER'); assertSourceTenant(row, scope.tenantId, 'CUSTOMER', sourceId, issues);
      const companyName = text(field(row, 'name', 'companyName', 'Company Name'));
      if (!sourceId) issues.push(issue('BLOCKING', 'SOURCE_ID_REQUIRED', 'CUSTOMER', '', 'Stable source identity is required.'));
      if (!companyName) issues.push(issue('BLOCKING', 'CUSTOMER_NAME_REQUIRED', 'CUSTOMER', sourceId, 'Company Name is required.'));
      const legacyId = text(field(row, 'id', 'CustomerID')); const customerId = CUSTOMER_ID.test(legacyId) ? legacyId : sourceId ? stableId('CUST', scope.tenantId, 'CUSTOMER', sourceId) : '';
      if (legacyId && legacyId !== customerId) issues.push(issue('WARNING', 'CUSTOMER_ID_MAPPED', 'CUSTOMER', sourceId, 'A malformed legacy ID was mapped deterministically.'));
      const status = text(field(row, 'status', 'Status')).toUpperCase() || (field(row, 'archivedAt', 'ArchivedAt') ? 'ARCHIVED' : 'ACTIVE');
      const createdAt = iso(field(row, 'createdAt', 'Created At')); const updatedAt = iso(field(row, 'updatedAt', 'Updated At'));
      if (!STATUSES.has(status)) issues.push(issue('BLOCKING', 'CUSTOMER_STATUS_INVALID', 'CUSTOMER', sourceId, 'Customer status is invalid.'));
      if (!createdAt || !updatedAt) issues.push(issue('BLOCKING', 'CUSTOMER_TIMESTAMP_INVALID', 'CUSTOMER', sourceId, 'Customer timestamp is invalid.'));
      const version = Number(field(row, 'version', 'Version') || 1); if (!Number.isInteger(version) || version < 1) issues.push(issue('BLOCKING', 'CUSTOMER_VERSION_INVALID', 'CUSTOMER', sourceId, 'Customer version is invalid.'));
      if (!issues.slice(before).some((item) => item.severity === 'BLOCKING')) { const customer = freeze({ tenantId: scope.tenantId, customerId, sourceId, companyName, normalizedName: normalized(companyName), primaryContactDisplay: text(field(row, 'primaryContact', 'Primary Contact')), email: text(field(row, 'email', 'Email')) || null, phone: text(field(row, 'phone', 'Phone')) || null, status, version, createdAt, updatedAt, archivedAt: status === 'ARCHIVED' ? updatedAt : null }); customers.push(customer); for (const key of new Set([legacyId, customerId, sourceId].filter(Boolean))) rememberCustomer(key, customerId); }
    }
    this.duplicates(customers, 'customerId', 'CUSTOMER', issues);
    for (const [legacyId, ids] of customerMappings) if (ids.size > 1) issues.push(issue('BLOCKING', 'CUSTOMER_MAPPING_AMBIGUOUS', 'CUSTOMER', legacyId, 'Legacy Customer identity maps to multiple canonical Customers.'));
    const resolveCustomer = (legacyId, entity, sourceId) => { const ids = customerMappings.get(legacyId); if (ids?.size === 1) return [...ids][0]; issues.push(issue('BLOCKING', ids?.size ? 'CUSTOMER_REFERENCE_AMBIGUOUS' : 'CUSTOMER_REFERENCE_MISSING', entity, sourceId, 'Customer reference does not map to exactly one canonical tenant Customer.')); return ''; };
    for (const row of snapshot.contacts) {
      const before = issues.length; const sourceId = sourceIdentity(row, 'CONTACT'); const legacyId = text(field(row, 'legacyContactId', 'contactId', 'ContactID', 'id')); assertSourceTenant(row, scope.tenantId, 'CONTACT', sourceId || legacyId, issues);
      const legacyCustomerId = text(field(row, 'customerId', 'CustomerID')); const customerId = resolveCustomer(legacyCustomerId, 'CONTACT', sourceId || legacyId); const displayName = text(field(row, 'displayName', 'DisplayName', 'Contact Name', 'name'));
      if (!sourceId) issues.push(issue('BLOCKING', 'SOURCE_ID_REQUIRED', 'CONTACT', legacyId, 'Stable source identity is required.'));
      if (!displayName) issues.push(issue('BLOCKING', 'CONTACT_NAME_REQUIRED', 'CONTACT', sourceId, 'DisplayName is required.'));
      const contactId = CONTACT_ID.test(legacyId) ? legacyId.toUpperCase() : sourceId ? stableId('CONTACT', scope.tenantId, 'CONTACT', sourceId).toUpperCase() : '';
      if (legacyId !== contactId) issues.push(issue('WARNING', 'CONTACT_ID_MAPPED', 'CONTACT', sourceId, 'Legacy Contact identity was mapped deterministically.'));
      const status = text(field(row, 'status', 'Status')).toUpperCase() || 'ACTIVE'; const createdAt = iso(field(row, 'createdAt', 'CreatedAt', 'Created At')); const updatedAt = iso(field(row, 'updatedAt', 'UpdatedAt', 'Updated At'));
      if (!STATUSES.has(status)) issues.push(issue('BLOCKING', 'CONTACT_STATUS_INVALID', 'CONTACT', sourceId, 'Contact status is invalid.'));
      if (!createdAt || !updatedAt) issues.push(issue('BLOCKING', 'CONTACT_TIMESTAMP_INVALID', 'CONTACT', sourceId, 'Contact timestamp is invalid.'));
      const version = Number(field(row, 'version', 'Version') || 1); if (!Number.isInteger(version) || version < 1) issues.push(issue('BLOCKING', 'CONTACT_VERSION_INVALID', 'CONTACT', sourceId, 'Contact version is invalid.'));
      if (issues.slice(before).some((item) => item.severity === 'BLOCKING')) continue;
      const contact = freeze({ tenantId: scope.tenantId, contactId, legacyContactId: legacyId, sourceId, customerId, displayName, normalizedDisplayName: normalized(displayName), email: text(field(row, 'email', 'Email')) || null, normalizedEmail: normalized(field(row, 'email', 'Email')) || null, phone: text(field(row, 'phone', 'Phone')) || null, titleRole: text(field(row, 'titleRole', 'TitleRole', 'Title Role')) || null, status, version, createdAt, updatedAt, archivedAt: status === 'ARCHIVED' ? updatedAt : null });
      contacts.push(contact);
      for (const key of new Set([legacyId, contactId].filter(Boolean))) { const list = contactMappings.get(key) || []; list.push(contact); contactMappings.set(key, list); }
    }
    this.duplicates(contacts, 'contactId', 'CONTACT', issues);
    const references = []; const unresolvedReferences = [];
    for (const [entity, rows] of [['RFQ', snapshot.rfqs], ['SALES_ACTIVITY', snapshot.salesActivities]]) for (const row of rows) {
      const sourceId = sourceIdentity(row, entity); assertSourceTenant(row, scope.tenantId, entity, sourceId, issues); if (!sourceId) issues.push(issue('BLOCKING', 'SOURCE_ID_REQUIRED', entity, '', 'Stable source identity is required.')); const legacyCustomerId = text(field(row, 'customerId', 'CustomerID')); const customerId = resolveCustomer(legacyCustomerId, entity, sourceId); const legacyContactId = text(field(row, 'contactId', 'ContactID'));
      if (!legacyContactId) { references.push(freeze({ entity, sourceId, customerId, legacyContactId: '', contactId: null, classification: 'BLANK' })); continue; }
      const matches = contactMappings.get(legacyContactId) || [];
      if (!matches.length) { const evidence = freeze({ sourceEntity: entity, sourceRecordIdentity: sourceId, legacyContactId, tenantId: scope.tenantId, customerId: customerId || null, reason: 'NO_DETERMINISTIC_CONTACT_MAPPING', migrationRunId: options.runId || null, resolutionStatus: 'UNRESOLVED' }); unresolvedReferences.push(evidence); references.push(freeze({ entity, sourceId, customerId, legacyContactId, contactId: null, classification: 'UNRESOLVED' })); continue; }
      if (matches.length !== 1 || matches[0].customerId !== customerId) { issues.push(issue('BLOCKING', matches.length !== 1 ? 'CONTACT_REFERENCE_AMBIGUOUS' : 'CONTACT_REFERENCE_CUSTOMER_CONFLICT', entity, sourceId, 'Contact reference is conflicting.')); references.push(freeze({ entity, sourceId, customerId, legacyContactId, contactId: null, classification: 'CONFLICTING' })); continue; }
      references.push(freeze({ entity, sourceId, customerId, legacyContactId, contactId: matches[0].contactId, classification: 'RESOLVED' }));
    }
    const preliminary = { tenantId: scope.tenantId, sourceFingerprint: snapshot.sourceFingerprint, sourceCounts: { customers: snapshot.customers.length, contacts: snapshot.contacts.length, rfqs: snapshot.rfqs.length, salesActivities: snapshot.salesActivities.length }, customers, contacts, references, unresolvedReferences, issues };
    let targetState; try { targetState = await this.target.inspect(preliminary, scope); } catch { throw new Error('Migration target inspection is unavailable.'); } const actions = this.reconcileTarget(preliminary, targetState, issues);
    return freeze({ ...preliminary, issues, actions, blocking: issues.filter((item) => item.severity === 'BLOCKING').length, warnings: issues.filter((item) => item.severity === 'WARNING').length, batchSize: this.sourceReader.batchSize || MAX_BATCH, targetState });
  }
  duplicates(rows, key, entity, issues) {
    const found = new Map();
    for (const row of rows) { if (!row[key]) continue; const prior = found.get(row[key]); if (prior) issues.push(issue('BLOCKING', compatible(prior, row, Object.keys(row).filter((name) => !['sourceId'].includes(name))) ? 'DUPLICATE_SOURCE_ROW' : 'DUPLICATE_CANONICAL_ID', entity, row.sourceId, 'Duplicate source identity is not safe to migrate.')); else found.set(row[key], row); }
  }
  reconcileTarget(plan, targetState, issues) {
    return reconcileTargetState(plan, targetState, issues);
  }
  async migrate(scope, fullContext, options) {
    if (options.confirmed !== true || !SAFE_ID.test(options.runId || '')) throw new Error('Explicit migration confirmation and a safe run ID are required.');
    const plan = await this.plan(scope, options); if (plan.blocking) return this.report('MIGRATE', plan, null, 'BLOCKED');
    let database, prerequisites; try { [database, prerequisites] = await Promise.all([this.installationReadiness.inspect(), this.installationPrerequisites(scope)]); } catch { database = { state: 'UNAVAILABLE', checks: {} }; prerequisites = { overall: 'NOT_READY' }; } const applicationRole = database?.checks?.applicationRole?.state; const migrationRole = database?.checks?.migrationRole?.state;
    if (database?.state !== 'READY' || applicationRole !== 'PASS' || migrationRole !== 'PASS' || prerequisites?.overall !== 'READY_FOR_NEXT_STEP') return freeze({ ...this.report('MIGRATE', plan, null, 'BLOCKED'), databaseReadiness: database?.state || 'UNAVAILABLE', installationReadiness: prerequisites?.overall || 'NOT_READY', applicationRole: applicationRole || 'UNAVAILABLE', migrationRole: migrationRole || 'UNAVAILABLE' });
    const run = freeze({ runId: options.runId, tenantId: scope.tenantId, mode: 'MIGRATE', sourceFingerprint: plan.sourceFingerprint, softwareVersion: this.softwareVersion, schemaMigrationLevel: database?.checks?.migration?.code || 'CURRENT', operatorId: scope.userId, startedAt: this.clock().toISOString(), counts: plan.sourceCounts, blockingIssues: 0, warnings: plan.warnings });
    try {
      if (this.target.recordRun) await this.target.recordRun(run, 'RUNNING', scope);
      const result = await this.target.migrate(plan, run, scope); const verification = await this.target.verify(plan, scope); const resultState = verification?.state === 'PASS' ? 'PASS' : 'FAILED';
      if (this.target.recordRun) await this.target.recordRun({ ...run, finishedAt: this.clock().toISOString(), targetResult: result }, resultState === 'PASS' ? 'COMPLETED' : 'FAILED', scope);
      return this.report('MIGRATE', plan, verification, resultState, { ...run, finishedAt: this.clock().toISOString(), result: resultState, targetResult: result });
    }
    catch {
      const failed = { ...run, finishedAt: this.clock().toISOString(), result: 'FAILED', retry: 'RECONCILE_BEFORE_RETRY' }; if (this.target.recordRun) try { await this.target.recordRun(failed, 'FAILED', scope); } catch { /* preserve the primary safe failure result */ }
      return this.report('MIGRATE', plan, null, 'FAILED', failed);
    }
  }
  report(mode, plan, verification, state = null, audit = null) {
    const emptyReferenceCounts = () => ({ resolved: 0, blank: 0, unresolved: 0, conflicting: 0 });
    const referenceCounts = { ...emptyReferenceCounts(), byEntity: { RFQ: emptyReferenceCounts(), SALES_ACTIVITY: emptyReferenceCounts() } };
    for (const ref of plan.references) {
      const classification = ref.classification.toLowerCase();
      referenceCounts[classification] += 1;
      referenceCounts.byEntity[ref.entity][classification] += 1;
    }
    return freeze({ mode, state: state || (plan.blocking ? 'NOT_READY' : 'READY'), tenantId: plan.tenantId, sourceFingerprint: plan.sourceFingerprint, sourceCounts: plan.sourceCounts, customerCounts: { valid: plan.customers.length, rejected: plan.sourceCounts.customers - plan.customers.length, archived: plan.customers.filter((row) => row.status === 'ARCHIVED').length, ...plan.actions.customers }, contactCounts: { valid: plan.contacts.length, rejected: plan.sourceCounts.contacts - plan.contacts.length, archived: plan.contacts.filter((row) => row.status === 'ARCHIVED').length, ...plan.actions.contacts }, referenceCounts, unresolvedReferences: plan.unresolvedReferences, issues: plan.issues, blocking: plan.blocking, warnings: plan.warnings, batchSize: plan.batchSize, verification: verification || null, audit: audit ? freeze(audit) : null });
  }
  async cutoverReadiness(scope, plan, verification) {
    let database, prerequisites; try { [database, prerequisites] = await Promise.all([this.installationReadiness.inspect(), this.installationPrerequisites(scope)]); } catch { database = { state: 'UNAVAILABLE', checks: {} }; prerequisites = { overall: 'NOT_READY' }; }
    const applicationRole = database?.checks?.applicationRole?.state === 'PASS' ? 'PASS' : 'ACTION_REQUIRED'; const migrationRole = database?.checks?.migrationRole?.state === 'PASS' ? 'PASS' : 'ACTION_REQUIRED';
    const ready = plan.blocking === 0 && plan.unresolvedReferences.length === 0 && verification?.state === 'PASS' && database?.state === 'READY' && prerequisites?.overall === 'READY_FOR_NEXT_STEP' && verification?.activePartialRun !== true && applicationRole === 'PASS' && migrationRole === 'PASS' && verification?.sourcePreservation === 'DEFINED';
    return freeze({ ...this.report('CUTOVER_READINESS', plan, verification), state: ready ? 'READY_FOR_CUSTOMER_CONTACT_CUTOVER' : 'NOT_READY', databaseReadiness: database?.state || 'UNAVAILABLE', installationReadiness: prerequisites?.overall || 'NOT_READY', applicationRole, migrationRole, cutoverActionAvailable: ready && Boolean(this.cutoverControl) });
  }
}

/** Fixed-shape parameterized PostgreSQL adapter. It batches records and uses the accepted runtime transaction boundary. */
export class PostgresCustomerContactMigrationTarget {
  constructor({ runtime, batchSize = 100, maxRows = MAX_ROWS } = {}) { if (!runtime?.query || !runtime?.withTransaction || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH) throw new Error('PostgreSQL migration target configuration is invalid.'); this.runtime = runtime; this.batchSize = batchSize; this.maxRows = maxRows; }
  async inspect(plan, scope, executor = this.runtime) {
    const customers = await this.select(executor, 'atlas_customers', 'customer_id', plan.customers.map((row) => row.customerId), scope.tenantId, 'MIGRATION_INSPECT_CUSTOMERS');
    const contacts = await this.select(executor, 'atlas_contacts', 'contact_id', plan.contacts.map((row) => row.contactId), scope.tenantId, 'MIGRATION_INSPECT_CONTACTS');
    return freeze({ customers: customers.map(customerRow), contacts: contacts.map(contactRow), foreignTenant: [] });
  }
  async select(executor, table, idColumn, ids, tenantId, operation) {
    if (!['atlas_customers', 'atlas_contacts'].includes(table) || !['customer_id', 'contact_id'].includes(idColumn)) throw new Error('Migration target shape is invalid.');
    const output = []; for (let index = 0; index < ids.length; index += this.batchSize) { const batch = ids.slice(index, index + this.batchSize); if (!batch.length) continue; const result = await executor.query(`SELECT * FROM ${table} WHERE tenant_id = $1 AND ${idColumn} = ANY($2::text[]) ORDER BY ${idColumn}`, [tenantId, batch], operation); output.push(...result.rows); } return output;
  }
  async migrate(plan, run, scope) {
    return this.runtime.withTransaction('CUSTOMER_CONTACT_DATA_MIGRATION', async (tx) => {
      const identity = await tx.query('SELECT tenant_id FROM atlas_installation WHERE tenant_id = $1 LIMIT 2', [scope.tenantId], 'MIGRATION_INSTALLATION_IDENTITY'); if (identity.rows.length !== 1) throw new Error('Installation identity mismatch.');
      const current = await this.inspect(plan, scope, tx); const issues = []; reconcileTargetState(plan, current, issues); if (issues.some((item) => item.severity === 'BLOCKING')) throw new Error('Target conflict.');
      for (let index = 0; index < plan.customers.length; index += this.batchSize) await tx.query(CUSTOMER_INSERT_SQL, [scope.tenantId, JSON.stringify(plan.customers.slice(index, index + this.batchSize))], 'MIGRATION_LOAD_CUSTOMERS');
      for (let index = 0; index < plan.contacts.length; index += this.batchSize) await tx.query(CONTACT_INSERT_SQL, [scope.tenantId, JSON.stringify(plan.contacts.slice(index, index + this.batchSize))], 'MIGRATION_LOAD_CONTACTS');
      for (let index = 0; index < plan.references.length; index += this.batchSize) {
        const batch = plan.references.slice(index, index + this.batchSize).filter((row) => row.classification === 'RESOLVED' || row.classification === 'BLANK'); const rfqs = batch.filter((row) => row.entity === 'RFQ'); const activities = batch.filter((row) => row.entity === 'SALES_ACTIVITY');
        if (rfqs.length) await tx.query(RFQ_REFERENCE_UPDATE_SQL, [scope.tenantId, JSON.stringify(rfqs)], 'MIGRATION_RECONCILE_RFQ_REFERENCES');
        if (activities.length) await tx.query(SALES_REFERENCE_UPDATE_SQL, [scope.tenantId, JSON.stringify(activities)], 'MIGRATION_RECONCILE_SALES_REFERENCES');
      }
      return freeze({ state: 'COMPLETED', runId: run.runId, actions: plan.actions });
    });
  }
  async recordRun(run, outcome, scope) { await this.runtime.query(AUDIT_SQL, [scope.tenantId, `MIGRATION-${run.runId}`, run.runId, outcome, run.startedAt, run.finishedAt || null, JSON.stringify({ ...run, outcome })], 'MIGRATION_AUDIT'); }
  async verify(plan, scope) {
    const state = await this.inspect(plan, scope); const customerIds = new Set(state.customers.map((row) => row.customerId)); const contactIds = new Set(state.contacts.map((row) => row.contactId));
    const missingCustomers = plan.customers.filter((row) => !customerIds.has(row.customerId)).map((row) => row.customerId); const missingContacts = plan.contacts.filter((row) => !contactIds.has(row.contactId)).map((row) => row.contactId);
    const referenceRows = await this.references(plan, scope); const expectedReferences = new Map(plan.references.map((row) => [`${row.entity}:${row.sourceId}`, row])); const referenceConflicts = referenceRows.filter((row) => { const expected = expectedReferences.get(`${row.entity}:${row.sourceId}`); return !expected || expected.customerId !== row.customerId || expected.classification === 'RESOLVED' && expected.contactId !== row.contactId || expected.classification === 'BLANK' && row.contactId !== null; }).map((row) => `${row.entity}:${row.sourceId}`);
    const counts = await this.runtime.query("SELECT (SELECT COUNT(*)::int FROM atlas_customers WHERE tenant_id = $1) AS customers, (SELECT COUNT(*)::int FROM atlas_contacts WHERE tenant_id = $1) AS contacts, (SELECT COUNT(*)::int FROM atlas_security_audit_events WHERE tenant_id = $1 AND operation = 'CUSTOMER_CONTACT_MIGRATION' AND outcome = 'RUNNING') AS partial_runs", [scope.tenantId], 'MIGRATION_VERIFY_COUNTS');
    const targetCounts = { customers: Number(counts.rows[0]?.customers || 0), contacts: Number(counts.rows[0]?.contacts || 0) }; const unexpected = targetCounts.customers !== plan.customers.length || targetCounts.contacts !== plan.contacts.length;
    return freeze({ state: !missingCustomers.length && !missingContacts.length && !unexpected && !referenceConflicts.length ? 'PASS' : 'FAIL', missingCustomers, missingContacts, referenceConflicts, targetCounts, expectedCounts: { customers: plan.customers.length, contacts: plan.contacts.length }, unexpectedTargetRows: unexpected, sourcePreservation: 'DEFINED', activePartialRun: Number(counts.rows[0]?.partial_runs || 0) > 0 });
  }
  async references(plan, scope) {
    const rfqIds = plan.references.filter((row) => row.entity === 'RFQ').map((row) => row.sourceId); const salesIds = plan.references.filter((row) => row.entity === 'SALES_ACTIVITY').map((row) => row.sourceId); const rows = [];
    for (let index = 0; index < rfqIds.length; index += this.batchSize) { const result = await this.runtime.query("SELECT 'RFQ' AS entity,rfq_id AS source_id,customer_id,contact_id FROM atlas_rfqs WHERE tenant_id=$1 AND rfq_id=ANY($2::text[])", [scope.tenantId, rfqIds.slice(index, index + this.batchSize)], 'MIGRATION_VERIFY_RFQ_REFERENCES'); rows.push(...result.rows); }
    for (let index = 0; index < salesIds.length; index += this.batchSize) { const result = await this.runtime.query("SELECT 'SALES_ACTIVITY' AS entity,sales_activity_id AS source_id,customer_id,contact_id FROM atlas_sales_activities WHERE tenant_id=$1 AND sales_activity_id=ANY($2::text[])", [scope.tenantId, salesIds.slice(index, index + this.batchSize)], 'MIGRATION_VERIFY_SALES_REFERENCES'); rows.push(...result.rows); }
    return rows.map((row) => freeze({ entity: row.entity, sourceId: row.source_id, customerId: row.customer_id, contactId: row.contact_id || null }));
  }
}

/** Explicit server-controlled per-domain cutover. The store must persist compare-and-set state and audit it. */
export class CustomerContactCutoverControl {
  constructor({ store, authorizer, readinessProvider, clock = () => new Date() } = {}) { if (!store?.get || !store?.compareAndSet || typeof authorizer !== 'function' || typeof readinessProvider !== 'function') throw new Error('Cutover control configuration is invalid.'); this.store = store; this.authorizer = authorizer; this.readinessProvider = readinessProvider; this.clock = clock; }
  async activate(context, expectedVersion) {
    const scope = trustedContext(context, 'CUSTOMER_CONTACT_CUTOVER'); let authorized = false; let readiness;
    try { [authorized, readiness] = await Promise.all([this.authorizer(context), this.readinessProvider(scope)]); } catch { throw new Error('Customer/Contact cutover authorization or readiness is unavailable.'); }
    if (authorized !== true || readiness?.state !== 'READY_FOR_CUSTOMER_CONTACT_CUTOVER') throw new Error('Customer/Contact cutover is not authorized.');
    let current; try { current = await this.store.get(scope.tenantId); } catch { throw new Error('Persistent domain routing state is unavailable.'); } if (current?.activePartialRun) throw new Error('Partial migration blocks cutover.');
    try { const next = await this.store.compareAndSet(scope.tenantId, expectedVersion, freeze({ customer: 'POSTGRESQL', contact: 'POSTGRESQL', legacySheets: 'READ_ONLY_MIGRATION_EVIDENCE', fallback: 'FAIL_CLOSED', activatedAt: this.clock().toISOString(), activatedBy: scope.userId, auditOperation: 'CUSTOMER_CONTACT_CUTOVER' })); if (next?.customer !== 'POSTGRESQL' || next?.contact !== 'POSTGRESQL') throw new Error('invalid cutover state'); return next; } catch { throw new Error('Cutover outcome is uncertain; reconcile authoritative routing state before retry.'); }
  }
  async route(context, domain) { const scope = trustedContext(context); if (!['CUSTOMER', 'CONTACT'].includes(domain)) throw new Error('Domain route is invalid.'); let state; try { state = await this.store.get(scope.tenantId); } catch { throw new Error('Persistent domain routing state is unavailable.'); } const selected = state?.[domain.toLowerCase()]; if (selected === 'POSTGRESQL' || selected === 'SHEETS') return selected; throw new Error('Persistent domain routing state is invalid; writes fail closed.'); }
  failClosedAfterCutover() { throw new Error('PostgreSQL is unavailable; automatic Sheets write fallback is disabled to prevent split-brain.'); }
}

function customerRow(row) { return freeze({ tenantId: row.tenant_id, customerId: row.customer_id, companyName: row.company_name, normalizedName: row.normalized_name, primaryContactDisplay: row.primary_contact_display, email: row.email, phone: row.phone, status: row.status, version: Number(row.version), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null }); }
function contactRow(row) { return freeze({ tenantId: row.tenant_id, contactId: row.contact_id, customerId: row.customer_id, displayName: row.display_name, normalizedDisplayName: row.normalized_display_name, email: row.email, normalizedEmail: row.normalized_email, phone: row.phone, titleRole: row.title_role, status: row.status, version: Number(row.version), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null }); }

const CUSTOMER_INSERT_SQL = `WITH input AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x("customerId" text,"companyName" text,"normalizedName" text,"primaryContactDisplay" text,email text,phone text,status text,version int,"createdAt" timestamptz,"updatedAt" timestamptz,"archivedAt" timestamptz)) INSERT INTO atlas_customers (tenant_id,customer_id,company_name,normalized_name,primary_contact_display,email,phone,status,version,created_at,updated_at,archived_at) SELECT $1,"customerId","companyName","normalizedName","primaryContactDisplay",email,phone,status,version,"createdAt","updatedAt","archivedAt" FROM input ON CONFLICT (tenant_id,customer_id) DO NOTHING`;
const CONTACT_INSERT_SQL = `WITH input AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x("contactId" text,"customerId" text,"displayName" text,"normalizedDisplayName" text,email text,"normalizedEmail" text,phone text,"titleRole" text,status text,version int,"createdAt" timestamptz,"updatedAt" timestamptz,"archivedAt" timestamptz)) INSERT INTO atlas_contacts (tenant_id,contact_id,customer_id,display_name,normalized_display_name,email,normalized_email,phone,title_role,status,version,created_at,updated_at,archived_at) SELECT $1,"contactId","customerId","displayName","normalizedDisplayName",email,"normalizedEmail",phone,"titleRole",status,version,"createdAt","updatedAt","archivedAt" FROM input ON CONFLICT (tenant_id,contact_id) DO NOTHING`;
const RFQ_REFERENCE_UPDATE_SQL = `WITH input AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x("sourceId" text,"customerId" text,"contactId" text)) UPDATE atlas_rfqs r SET contact_id=i."contactId",updated_at=NOW() FROM input i WHERE r.tenant_id=$1 AND r.rfq_id=i."sourceId" AND r.customer_id=i."customerId"`;
const SALES_REFERENCE_UPDATE_SQL = `WITH input AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x("sourceId" text,"customerId" text,"contactId" text)) UPDATE atlas_sales_activities a SET contact_id=i."contactId",updated_at=NOW() FROM input i WHERE a.tenant_id=$1 AND a.sales_activity_id=i."sourceId" AND a.customer_id=i."customerId"`;
const AUDIT_SQL = `INSERT INTO atlas_security_audit_events (tenant_id,event_id,operation,correlation_id,outcome,occurred_at,completed_at,details_json) VALUES ($1,$2,'CUSTOMER_CONTACT_MIGRATION',$3,$4,$5,$6,$7::jsonb) ON CONFLICT (tenant_id,event_id) DO UPDATE SET outcome=EXCLUDED.outcome,completed_at=EXCLUDED.completed_at,details_json=EXCLUDED.details_json`;
