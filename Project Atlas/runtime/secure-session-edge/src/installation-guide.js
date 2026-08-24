const TARGETS = Object.freeze({ AWS_RDS_POSTGRESQL: 'Amazon RDS for PostgreSQL', AZURE_POSTGRESQL_FLEXIBLE_SERVER: 'Azure Database for PostgreSQL Flexible Server' });
export const INSTALLATION_STEPS = Object.freeze([
  ['TARGET', 'Choose a supported tenant-owned deployment target.'],
  ['RESPONSIBILITY', 'Confirm that the tenant operates hosting, backups, networking, secrets, and cloud billing.'],
  ['CONNECTION', 'Provide the endpoint only through trusted server-side installation configuration.'],
  ['TLS', 'Require encrypted connections with certificate validation.'],
  ['APPLICATION_ROLE', 'Configure the least-privilege application database role.'],
  ['MIGRATION_ROLE', 'Configure the separate migration database role.'],
  ['SECRETS', 'Store credentials in the tenant secret manager or key vault.'],
  ['READINESS', 'Validate connectivity, version, installation identity, roles, migrations, schema, and session storage.'],
  ['FIRST_ADMIN', 'Prepare a deliberate, tenant-scoped first-admin bootstrap.'],
  ['BACKUP', 'Confirm backup and restore responsibility before go-live.'],
  ['SUMMARY', 'Review readiness; initialization and migration remain separate authorized actions.']
].map(([id, label]) => Object.freeze({ id, label })));

const READINESS_MESSAGES = Object.freeze({
  READY: ['READY', 'READY', 'The environment is ready for the next explicitly authorized installation action.'],
  INITIALIZATION_REQUIRED: ['ACTION_REQUIRED', 'INITIALIZATION_REQUIRED', 'The database is empty or has no Atlas installation identity. Initialize only through an authorized installer action.'],
  MIGRATION_REQUIRED: ['UPGRADE_REQUIRED', 'SCHEMA_OUTDATED', 'The Atlas schema needs an explicitly authorized migration.'],
  UPGRADE_REQUIRED: ['UPGRADE_REQUIRED', 'SCHEMA_UPGRADE_REQUIRED', 'An Atlas upgrade requires operator attention before continuing.'],
  DATABASE_UNAVAILABLE: ['UNAVAILABLE', 'DATABASE_UNREACHABLE', 'Atlas cannot reach the database. Check tenant networking and trusted configuration, then retry.'],
  CONFIGURATION_ERROR: ['CONFIGURATION_ERROR', 'CONFIGURATION_ERROR', 'Trusted installation configuration needs correction.'],
  SECURITY_ERROR: ['NOT_READY', 'SECURITY_CONFIGURATION', 'TLS, tenant identity, or database-role security requirements are not satisfied.'],
  INCOMPATIBLE: ['NOT_READY', 'SCHEMA_INCOMPATIBLE', 'The database version or schema is not compatible with this Atlas release.']
});

function bootstrapReady(bootstrap) { return bootstrap?.state === 'READY' && bootstrap.tenantScoped === true && bootstrap.platformAuthority !== true; }
function escaped(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

/** Server-only orchestration. It never accepts database credentials or tenant authority from a browser. */
export class TenantInstallationGuide {
  constructor({ readinessValidator, bootstrap = {}, deploymentTarget = '', clock = () => new Date() } = {}) {
    if (!readinessValidator?.inspect) throw new Error('Installation readiness validator is required.');
    this.readinessValidator = readinessValidator; this.bootstrap = bootstrap; this.deploymentTarget = Object.hasOwn(TARGETS, deploymentTarget) ? deploymentTarget : ''; this.clock = clock; this.generation = 0; this.current = this.compose('NOT_STARTED', 'NOT_STARTED', 'Begin by reviewing tenant responsibilities and trusted server-side setup requirements.', null);
  }
  selectTarget(target) { this.deploymentTarget = Object.hasOwn(TARGETS, target) ? target : ''; this.current = this.compose(this.current.state, this.current.remediationCategory, this.current.message, this.current.readiness); return this.snapshot(); }
  acknowledge({ tenantResponsibilities, backupRestore } = {}) { this.acknowledgements = { tenantResponsibilities: tenantResponsibilities === true, backupRestore: backupRestore === true }; this.current = this.compose(this.current.state, this.current.remediationCategory, this.current.message, this.current.readiness); return this.snapshot(); }
  async validate() {
    const generation = ++this.generation; this.current = this.compose('VALIDATING', 'VALIDATING', 'Checking the trusted database configuration.', this.current.readiness); let readiness;
    try { readiness = await this.readinessValidator.inspect(); } catch { readiness = { state: 'DATABASE_UNAVAILABLE', remediationCode: 'DATABASE_UNREACHABLE', checks: {} }; }
    if (generation !== this.generation) return Object.freeze({ ignored: true });
    const mapped = READINESS_MESSAGES[readiness.state] || ['NOT_READY', 'READINESS_UNKNOWN', 'Atlas could not classify this readiness result.'];
    this.current = this.compose(mapped[0], mapped[1], mapped[2], readiness); return this.snapshot();
  }
  async retry() { return this.validate(); }
  snapshot() { return Object.freeze({ ...this.current, steps: this.current.steps.map((step) => Object.freeze({ ...step })) }); }
  compose(state, remediationCategory, message, readiness) {
    const acknowledgements = this.acknowledgements || {}; const ready = state === 'READY' && Boolean(this.deploymentTarget) && bootstrapReady(this.bootstrap) && acknowledgements.tenantResponsibilities && acknowledgements.backupRestore;
    const steps = INSTALLATION_STEPS.map((step) => ({ ...step, status: this.stepStatus(step.id, state, readiness, acknowledgements) }));
    return Object.freeze({ state, remediationCategory, message, readiness: readiness ? Object.freeze({ state: readiness.state, remediationCode: readiness.remediationCode, checks: readiness.checks }) : null, deploymentTarget: this.deploymentTarget, deploymentTargetLabel: TARGETS[this.deploymentTarget] || '', firstAdmin: bootstrapReady(this.bootstrap) ? 'READY' : 'ACTION_REQUIRED', goLiveEligible: ready, generatedAt: this.clock().toISOString(), steps });
  }
  stepStatus(id, state, readiness, acknowledgements) {
    if (id === 'TARGET') return this.deploymentTarget ? 'COMPLETE' : 'ACTION_REQUIRED';
    if (id === 'RESPONSIBILITY') return acknowledgements.tenantResponsibilities ? 'COMPLETE' : 'ACTION_REQUIRED';
    if (id === 'BACKUP') return acknowledgements.backupRestore ? 'COMPLETE' : 'ACTION_REQUIRED';
    if (id === 'FIRST_ADMIN') return bootstrapReady(this.bootstrap) ? 'READY' : 'ACTION_REQUIRED';
    if (id === 'SUMMARY') return state;
    if (id === 'READINESS') return state;
    if (!readiness) return 'NOT_STARTED';
    const checks = { CONNECTION: 'connectivity', TLS: 'tls', APPLICATION_ROLE: 'applicationRole', MIGRATION_ROLE: 'migrationRole' };
    return checks[id] ? (readiness.checks?.[checks[id]]?.state === 'PASS' ? 'READY' : 'ACTION_REQUIRED') : (state === 'READY' ? 'READY' : 'ACTION_REQUIRED');
  }
}

/** Render-only contract for D-B host integration; it contains no credential input or persistence. */
export function renderInstallationGuide(report) {
  const steps = (report?.steps || []).map((step) => `<li><strong>${escaped(step.label)}</strong><span role="status">${escaped(step.status)}</span></li>`).join('');
  return `<main aria-busy="${report?.state === 'VALIDATING'}"><style>button[data-action="retry"]{min-height:44px;min-width:44px}button[data-action="retry"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}</style><h1>Atlas database installation</h1><p role="status" aria-live="polite">${escaped(report?.message)}</p><ol>${steps}</ol><p>Atlas provides software, migration tooling, and readiness validation. Your organization operates hosting, backups, uptime, network controls, secrets, and cloud billing.</p><button type="button" data-action="retry" ${report?.state === 'VALIDATING' ? 'disabled aria-disabled="true"' : ''}>Retry validation</button></main>`;
}
