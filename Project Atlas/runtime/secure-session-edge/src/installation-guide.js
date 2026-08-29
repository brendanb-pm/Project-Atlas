const TARGETS = Object.freeze({
  AWS_RDS_POSTGRESQL: Object.freeze({ label: 'Amazon RDS for PostgreSQL', secrets: 'AWS Secrets Manager', guidance: 'Use tenant-owned RDS, authenticated TLS, private networking where practical, and tenant-managed backups, monitoring, patching, and HA.' }),
  AZURE_POSTGRESQL_FLEXIBLE_SERVER: Object.freeze({ label: 'Azure Database for PostgreSQL Flexible Server', secrets: 'Azure Key Vault', guidance: 'Use tenant-owned Flexible Server, authenticated TLS, controlled network access, and tenant-managed backups, monitoring, patching, and HA.' }),
  GENERIC_POSTGRESQL: Object.freeze({ label: 'Compatible PostgreSQL (advanced)', secrets: 'Approved server-side secret storage', guidance: 'Meet the same PostgreSQL 17, TLS, role-separation, identity, schema, and backup requirements as managed targets.' })
});

export const INSTALLATION_STEPS = Object.freeze([
  ['WELCOME', 'Review the browser-based MOS deployment model and operating responsibilities.'],
  ['TARGET', 'Choose a supported tenant-owned PostgreSQL deployment target.'],
  ['VERSION', 'Confirm the supported PostgreSQL version policy.'],
  ['CONNECTION', 'Configure the trusted server-side endpoint and network boundary.'],
  ['TLS', 'Require encrypted connections with certificate validation.'],
  ['SECRETS', 'Keep credentials in approved tenant-owned server-side secret storage.'],
  ['APPLICATION_ROLE', 'Configure the least-privilege application role.'],
  ['MIGRATION_ROLE', 'Configure separate migration authority.'],
  ['CONNECTIVITY', 'Run the authoritative D-A connectivity and readiness inspection.'],
  ['DATABASE', 'Review the safe database classification.'],
  ['IDENTITY', 'Confirm authoritative installation and tenant identity.'],
  ['MIGRATION_PREFLIGHT', 'Review migration level, checksums, compatibility, and backup responsibility.'],
  ['MIGRATION_EXECUTION', 'Explicitly authorize the accepted migration runner when required.'],
  ['POST_MIGRATION', 'Re-run D-A after any migration.'],
  ['RUNTIME', 'Review session-store and transaction/runtime smoke readiness.'],
  ['FIRST_ADMIN', 'Prepare a deliberate tenant-scoped first-admin bootstrap.'],
  ['BACKUP', 'Acknowledge tenant backup, restore-test, PITR, and disaster-recovery ownership.'],
  ['SUMMARY', 'Review database installation readiness separately from production go-live.']
].map(([id, label]) => Object.freeze({ id, label })));

const SAFE_CHECKS = Object.freeze(['configuration', 'connectivity', 'version', 'tls', 'installation', 'applicationRole', 'migrationRole', 'migration', 'foundationSchema', 'domainSchema', 'sessionSchema', 'transactionSmoke', 'tenantScope']);
const REMEDIATIONS = Object.freeze({
  DATABASE_UNREACHABLE: ['TENANT', 'Verify database uptime, endpoint reachability, private networking, firewall/security-group rules, and trusted server configuration.', true],
  TLS_CONFIGURATION: ['TENANT', 'Require TLS with certificate validation for both application and migration connections.', true],
  VERSION_UNSUPPORTED: ['TENANT', 'Use the currently supported PostgreSQL 17 baseline or wait for a later version certification.', true],
  APPLICATION_ROLE_INVALID: ['TENANT', 'Remove schema, ownership, superuser, and migration-metadata authority from the runtime role.', true],
  MIGRATION_ROLE_INVALID: ['TENANT', 'Use a separate non-superuser migration role with the required schema and migration-metadata authority.', true],
  DATABASE_NOT_EMPTY: ['TENANT', 'Use an empty compatible database or an already identified Atlas database; do not alter unknown data automatically.', false],
  UNKNOWN_DATABASE: ['TENANT', 'Stop and classify the existing database before any initialization or migration.', false],
  SCHEMA_OUTDATED: ['ATLAS_AND_TENANT', 'Review migration preflight and explicitly authorize the accepted Atlas migration runner after confirming backup/restore readiness.', true],
  SCHEMA_INCOMPATIBLE: ['ATLAS_AND_TENANT', 'Stop; resolve the schema compatibility issue without rewriting or downgrading unknown history.', false],
  CHECKSUM_FAILURE: ['ATLAS_AND_TENANT', 'Stop; reconcile migration history and checksums before retrying.', false],
  INSTALLATION_IDENTITY_CONFLICT: ['ATLAS_AND_TENANT', 'Stop; this database is bound to a different installation or tenant.', false],
  SESSION_STORE_UNAVAILABLE: ['ATLAS_AND_TENANT', 'Restore the PostgreSQL session schema/runtime dependency and re-run readiness.', true],
  MIGRATION_REQUIRED: ['ATLAS_AND_TENANT', 'Complete explicit migration preflight and authorization; migrations never run by visiting or rendering this guide.', true],
  MIGRATION_FAILED: ['ATLAS_AND_TENANT', 'Reconcile authoritative migration status before deciding whether retry is safe.', false],
  RUNTIME_NOT_READY: ['ATLAS_AND_TENANT', 'Resolve the failed session or transaction/runtime smoke check, then re-run D-A.', true],
  OIDC_ACTIVATION_PENDING: ['ATLAS', 'Complete the separately authorized live OIDC activation before production go-live.', false],
  READY: ['NONE', 'The database installation is ready for the next explicitly authorized step; this is not production go-live acceptance.', false],
  READINESS_UNKNOWN: ['ATLAS_AND_TENANT', 'Stop and obtain a deterministic D-A result before continuing.', true]
});

function bootstrapReady(value) { return value?.state === 'READY' && value.tenantScoped === true && value.platformAuthority !== true; }
function escaped(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function checkState(checks, name) { return checks?.[name]?.state === 'PASS' ? 'PASS' : checks?.[name]?.state === 'NOT_APPLICABLE' ? 'PENDING' : 'ACTION_REQUIRED'; }
function safeCode(value, fallback = 'UNAVAILABLE') { const code = String(value || ''); return /^[A-Z0-9_]{1,80}$/.test(code) ? code : fallback; }
function safeReadiness(readiness) {
  const checks = {};
  for (const name of SAFE_CHECKS) if (readiness?.checks?.[name]) checks[name] = Object.freeze({ state: safeCode(readiness.checks[name].state, 'FAIL'), code: safeCode(readiness.checks[name].code) });
  return Object.freeze({ state: safeCode(readiness?.state, 'CONFIGURATION_ERROR'), remediationCode: safeCode(readiness?.remediationCode, 'READINESS_UNKNOWN'), checks: Object.freeze(checks) });
}
function databaseClassification(readiness) {
  const code = readiness?.remediationCode;
  if (readiness?.state === 'READY') return 'ATLAS_DOMAIN_SCHEMA';
  if (code === 'ATLAS_SCHEMA_UNINITIALIZED' || code === 'INSTALLATION_EMPTY') return 'EMPTY_COMPATIBLE';
  if (code === 'MIGRATION_REQUIRED' || code === 'MIGRATION_INCOMPLETE') return readiness?.checks?.domainSchema?.state === 'PASS' ? 'ATLAS_OUTDATED' : 'ATLAS_FOUNDATION_ONLY';
  if (code === 'MIGRATION_CHECKSUM_DRIFT') return 'CHECKSUM_MISMATCH';
  if (code === 'SCHEMA_AHEAD_INCOMPATIBLE' || code === 'SCHEMA_STRUCTURE_INCOMPLETE') return 'ATLAS_INCOMPATIBLE';
  if (code === 'INSTALLATION_TENANT_MISMATCH' || code === 'INSTALLATION_METADATA_MALFORMED') return 'ATLAS_INCOMPATIBLE';
  return readiness?.checks?.connectivity?.state === 'PASS' ? 'UNKNOWN_NON_ATLAS_DATABASE' : 'UNAVAILABLE';
}
function remediationCategory(readiness) {
  const code = readiness?.remediationCode;
  if (readiness?.state === 'READY') return 'READY';
  if (code === 'TLS_CONFIGURATION_INVALID') return 'TLS_CONFIGURATION';
  if (code?.startsWith('POSTGRESQL_')) return 'VERSION_UNSUPPORTED';
  if (code?.startsWith('APPLICATION_ROLE')) return 'APPLICATION_ROLE_INVALID';
  if (code?.startsWith('MIGRATION_ROLE') || code === 'DATABASE_ROLES_NOT_DISTINCT') return 'MIGRATION_ROLE_INVALID';
  if (code === 'MIGRATION_CHECKSUM_DRIFT') return 'CHECKSUM_FAILURE';
  if (code === 'MIGRATION_REQUIRED' || code === 'MIGRATION_INCOMPLETE') return 'MIGRATION_REQUIRED';
  if (code === 'SCHEMA_AHEAD_INCOMPATIBLE' || code === 'SCHEMA_STRUCTURE_INCOMPLETE') return 'SCHEMA_INCOMPATIBLE';
  if (code === 'INSTALLATION_TENANT_MISMATCH' || code === 'INSTALLATION_METADATA_MALFORMED') return 'INSTALLATION_IDENTITY_CONFLICT';
  if (code === 'INSTALLATION_METADATA_MISSING') return 'UNKNOWN_DATABASE';
  if (code === 'ATLAS_SCHEMA_UNINITIALIZED' || code === 'INSTALLATION_EMPTY') return 'MIGRATION_REQUIRED';
  if (readiness?.state === 'DATABASE_UNAVAILABLE') return 'DATABASE_UNREACHABLE';
  if (readiness?.state === 'SECURITY_ERROR') return 'RUNTIME_NOT_READY';
  return 'READINESS_UNKNOWN';
}
function remediation(category) {
  const [owner, action, retrySafe] = REMEDIATIONS[category] || REMEDIATIONS.READINESS_UNKNOWN;
  return Object.freeze({ category, owner, action, retrySafe });
}

/** Server-only D-B orchestration. Browser input never supplies tenant identity, credentials, provider authority, readiness, or migration authority. */
export class TenantInstallationGuide {
  constructor({ readinessValidator, bootstrap = {}, deploymentTarget = '', clock = () => new Date(), migrationExecutor = null, migrationAuthorizer = null, runtimeSmoke = null } = {}) {
    if (!readinessValidator?.inspect) throw new Error('Installation readiness validator is required.');
    this.readinessValidator = readinessValidator; this.bootstrap = bootstrap; this.deploymentTarget = Object.hasOwn(TARGETS, deploymentTarget) ? deploymentTarget : ''; this.clock = clock;
    this.migrationExecutor = migrationExecutor; this.migrationAuthorizer = migrationAuthorizer; this.runtimeSmoke = runtimeSmoke; this.generation = 0; this.migrationInFlight = false;
    this.acknowledgements = Object.freeze({ tenantResponsibilities: false, backupRestore: false });
    this.current = this.compose('NOT_STARTED', remediation('READINESS_UNKNOWN'), 'Begin by reviewing responsibilities and trusted server-side prerequisites.', null, null);
  }
  static targets() { return TARGETS; }
  selectTarget(target) { this.deploymentTarget = Object.hasOwn(TARGETS, target) ? target : ''; this.refresh(); return this.snapshot(); }
  acknowledge({ tenantResponsibilities, backupRestore } = {}) { this.acknowledgements = Object.freeze({ tenantResponsibilities: tenantResponsibilities === true, backupRestore: backupRestore === true }); this.refresh(); return this.snapshot(); }
  cancelValidation() { this.generation += 1; this.current = this.compose('NOT_STARTED', remediation('READINESS_UNKNOWN'), 'Validation cancelled. Configuration was not changed.', this.current.readiness, this.current.runtimeSmoke); return this.snapshot(); }
  async validate() {
    const generation = ++this.generation;
    this.current = this.compose('VALIDATING', remediation('READINESS_UNKNOWN'), 'Validating trusted database configuration with MOS-133D-A.', this.current.readiness, this.current.runtimeSmoke, generation);
    let inspected;
    try { inspected = safeReadiness(await this.readinessValidator.inspect()); } catch { inspected = safeReadiness({ state: 'DATABASE_UNAVAILABLE', remediationCode: 'DATABASE_UNAVAILABLE', checks: { connectivity: { state: 'FAIL', code: 'DATABASE_UNAVAILABLE' } } }); }
    if (generation !== this.generation) return Object.freeze({ ignored: true, generation });
    let smoke = null;
    if (inspected.state === 'READY' && this.runtimeSmoke) {
      try { const value = await this.runtimeSmoke(); smoke = Object.freeze({ sessionStore: value?.sessionStore === 'PASS' ? 'PASS' : 'ACTION_REQUIRED', runtime: value?.runtime === 'PASS' ? 'PASS' : 'ACTION_REQUIRED' }); }
      catch { smoke = Object.freeze({ sessionStore: 'ACTION_REQUIRED', runtime: 'ACTION_REQUIRED' }); }
      if (generation !== this.generation) return Object.freeze({ ignored: true, generation });
    }
    const category = smoke && (smoke.sessionStore !== 'PASS' || smoke.runtime !== 'PASS') ? 'RUNTIME_NOT_READY' : remediationCategory(inspected);
    const state = inspected.state === 'READY' && category === 'READY' ? 'READY' : inspected.state === 'DATABASE_UNAVAILABLE' ? 'UNAVAILABLE' : inspected.state === 'MIGRATION_REQUIRED' || inspected.state === 'UPGRADE_REQUIRED' ? 'ACTION_REQUIRED' : 'NOT_READY';
    this.current = this.compose(state, remediation(category), remediation(category).action, inspected, smoke, generation);
    return this.snapshot();
  }
  async retry() { return this.validate(); }
  migrationPreflight() {
    const readiness = this.current.readiness;
    const required = readiness?.state === 'MIGRATION_REQUIRED' || readiness?.state === 'UPGRADE_REQUIRED' || readiness?.remediationCode === 'ATLAS_SCHEMA_UNINITIALIZED';
    return Object.freeze({ status: required ? 'ACTION_REQUIRED' : readiness?.state === 'READY' ? 'PASS' : 'UNAVAILABLE', currentLevel: readiness?.checks?.migration?.code || 'UNAVAILABLE', targetLevel: 'CURRENT_ATLAS_RELEASE', checksumStatus: readiness?.remediationCode === 'MIGRATION_CHECKSUM_DRIFT' ? 'ACTION_REQUIRED' : readiness ? 'PASS' : 'UNAVAILABLE', compatible: !['SCHEMA_AHEAD_INCOMPATIBLE', 'MIGRATION_CHECKSUM_DRIFT'].includes(readiness?.remediationCode), migrationRequired: required, backupAcknowledged: this.acknowledgements.backupRestore, explicitAuthorizationRequired: true, changeClass: 'ATLAS_SCHEMA_MIGRATIONS', executionAvailable: Boolean(this.migrationExecutor && this.migrationAuthorizer) });
  }
  async executeMigrations({ confirmed = false, authorizationContext = null } = {}) {
    const preflight = this.migrationPreflight();
    if (!preflight.migrationRequired) return Object.freeze({ state: 'NOT_REQUIRED' });
    if (!confirmed || !preflight.backupAcknowledged) return Object.freeze({ state: 'ACTION_REQUIRED', remediation: remediation('MIGRATION_REQUIRED') });
    if (!this.migrationExecutor?.apply || !this.migrationAuthorizer) return Object.freeze({ state: 'PENDING', remediation: remediation('MIGRATION_REQUIRED') });
    if (this.migrationInFlight) return Object.freeze({ state: 'ACTION_REQUIRED', code: 'MIGRATION_ALREADY_IN_PROGRESS' });
    this.migrationInFlight = true;
    try {
      let authorized = false;
      try { authorized = await this.migrationAuthorizer(authorizationContext) === true; } catch { return Object.freeze({ state: 'NOT_AUTHORIZED' }); }
      if (!authorized) return Object.freeze({ state: 'NOT_AUTHORIZED' });
      await this.migrationExecutor.apply(); const postMigration = await this.validate(); return Object.freeze({ state: postMigration.state === 'READY' ? 'PASS' : 'ACTION_REQUIRED', postMigration });
    }
    catch { this.current = this.compose('NOT_READY', remediation('MIGRATION_FAILED'), REMEDIATIONS.MIGRATION_FAILED[1], this.current.readiness, this.current.runtimeSmoke); return Object.freeze({ state: 'MIGRATION_FAILED', retrySafe: false }); }
    finally { this.migrationInFlight = false; }
  }
  snapshot() { return Object.freeze({ ...this.current, steps: this.current.steps.map((step) => Object.freeze({ ...step })), readinessSummary: Object.freeze({ ...this.current.readinessSummary }), migrationPreflight: this.migrationPreflight() }); }
  refresh() { this.current = this.compose(this.current.state, this.current.remediation, this.current.message, this.current.readiness, this.current.runtimeSmoke, this.current.operationGeneration); }
  compose(state, fix, message, readiness, smoke, operationGeneration = this.generation) {
    const target = TARGETS[this.deploymentTarget]; const summary = this.summary(readiness, smoke);
    const readyForNextStep = state === 'READY' && Boolean(target) && bootstrapReady(this.bootstrap) && this.acknowledgements.tenantResponsibilities && this.acknowledgements.backupRestore;
    return Object.freeze({ state, overall: readyForNextStep ? 'READY_FOR_NEXT_STEP' : 'NOT_READY', message, remediationCategory: fix.category, remediation: fix, readiness, runtimeSmoke: smoke, deploymentTarget: this.deploymentTarget, deploymentTargetLabel: target?.label || '', deploymentGuidance: target?.guidance || '', secretStorageGuidance: target?.secrets || '', databaseClassification: databaseClassification(readiness), firstAdmin: bootstrapReady(this.bootstrap) ? 'PASS' : 'PENDING', readyForNextStep, goLiveEligible: false, productionGoLive: 'PENDING', operationGeneration, generatedAt: this.clock().toISOString(), readinessSummary: summary, steps: INSTALLATION_STEPS.map((step) => ({ ...step, status: this.stepStatus(step.id, state, readiness, summary) })) });
  }
  summary(readiness, smoke) {
    const checks = readiness?.checks || {}; const schema = readiness?.state === 'READY' && ['foundationSchema', 'domainSchema'].every((name) => checks[name]?.state === 'PASS') ? 'PASS' : readiness ? 'ACTION_REQUIRED' : 'UNAVAILABLE';
    return { DATABASE: checkState(checks, 'connectivity'), TLS: checkState(checks, 'tls'), APPLICATION_ROLE: checkState(checks, 'applicationRole'), MIGRATION_ROLE: checkState(checks, 'migrationRole'), SCHEMA: schema, CHECKSUMS: readiness?.remediationCode === 'MIGRATION_CHECKSUM_DRIFT' ? 'ACTION_REQUIRED' : checkState(checks, 'migration'), INSTALLATION_IDENTITY: checkState(checks, 'installation'), SESSION_STORE: smoke?.sessionStore || checkState(checks, 'sessionSchema'), RUNTIME: smoke?.runtime || checkState(checks, 'transactionSmoke'), FIRST_ADMIN: bootstrapReady(this.bootstrap) ? 'PASS' : 'PENDING', BACKUP_RESPONSIBILITY: this.acknowledgements.backupRestore ? 'PASS' : 'ACTION_REQUIRED', LIVE_OIDC: 'PENDING', BUSINESS_DATA_MIGRATION: 'PENDING' };
  }
  stepStatus(id, state, readiness, summary) {
    if (id === 'WELCOME') return this.acknowledgements.tenantResponsibilities ? 'PASS' : 'ACTION_REQUIRED';
    if (id === 'TARGET') return this.deploymentTarget ? 'PASS' : 'ACTION_REQUIRED';
    if (id === 'BACKUP') return summary.BACKUP_RESPONSIBILITY;
    if (id === 'FIRST_ADMIN') return summary.FIRST_ADMIN;
    if (id === 'SUMMARY') return state === 'READY' ? 'PASS' : state;
    if (id === 'VERSION') return checkState(readiness?.checks, 'version');
    const map = { CONNECTION: 'DATABASE', TLS: 'TLS', APPLICATION_ROLE: 'APPLICATION_ROLE', MIGRATION_ROLE: 'MIGRATION_ROLE', CONNECTIVITY: 'DATABASE', DATABASE: 'DATABASE', IDENTITY: 'INSTALLATION_IDENTITY', MIGRATION_PREFLIGHT: 'SCHEMA', MIGRATION_EXECUTION: 'SCHEMA', POST_MIGRATION: 'SCHEMA', RUNTIME: 'RUNTIME' };
    if (id === 'SECRETS') return this.deploymentTarget ? 'PASS' : 'ACTION_REQUIRED';
    return map[id] ? summary[map[id]] : 'PENDING';
  }
}

/** Safe render contract for a future authenticated tenant-admin host. It contains no credential fields or browser authority. */
export function renderInstallationGuide(report) {
  const steps = (report?.steps || []).map((step) => `<li data-state="${escaped(step.status)}"><span>${escaped(step.label)}</span><strong role="status">${escaped(step.status)}</strong></li>`).join('');
  const summary = Object.entries(report?.readinessSummary || {}).map(([name, status]) => `<div><dt>${escaped(name.replaceAll('_', ' '))}</dt><dd>${escaped(status)}</dd></div>`).join('');
  const busy = report?.state === 'VALIDATING';
  return `<main aria-busy="${busy}"><style>button{min-height:44px;min-width:44px}button:focus-visible{outline:3px solid currentColor;outline-offset:3px}[data-state="ACTION_REQUIRED"]{border-inline-start:4px solid currentColor}</style><h1>Atlas PostgreSQL installation</h1><p>MOS is a web application for normal users; no desktop client is required.</p><p>Atlas supplies application software, licensing, schema compatibility, migrations, and readiness tooling. Your organization operates hosting, uptime, networking, secrets, backups, restore testing, disaster recovery, and cloud billing.</p><nav aria-label="Installation progress"><ol>${steps}</ol></nav><section aria-labelledby="readiness-summary"><h2 id="readiness-summary">Readiness summary</h2><p role="status" aria-live="polite">${escaped(report?.message)}</p><dl>${summary}</dl><p><strong>${escaped(report?.overall || 'NOT_READY')}</strong> — database installation readiness is not production go-live acceptance.</p></section><button type="button" data-action="retry" ${busy ? 'disabled aria-disabled="true"' : ''}>${busy ? 'Validating…' : 'Retry validation'}</button></main>`;
}
