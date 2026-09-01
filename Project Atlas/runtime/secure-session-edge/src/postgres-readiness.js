const FOUNDATION_TABLES = Object.freeze(['atlas_installation', 'atlas_auth_sessions', 'atlas_provider_contract_records', 'atlas_security_events', 'atlas_schema_migrations']);
const DOMAIN_TABLES = Object.freeze(['atlas_users', 'atlas_tenant_memberships', 'atlas_external_identities', 'atlas_security_audit_events', 'atlas_customers', 'atlas_contacts', 'atlas_rfqs', 'atlas_quotes', 'atlas_quote_revisions', 'atlas_quote_lines', 'atlas_jobs', 'atlas_job_operations', 'atlas_job_events', 'atlas_job_qr_tokens', 'atlas_vendors', 'atlas_purchase_requests', 'atlas_purchase_approvals', 'atlas_invoices', 'atlas_cash_receipts', 'atlas_sales_activities', 'atlas_follow_ups', 'atlas_crm_activity_events', 'atlas_serialized_firearms', 'atlas_firearm_regulatory_events', 'atlas_tool_types', 'atlas_tool_instances', 'atlas_tool_measurements', 'atlas_tool_condition_events', 'atlas_holders', 'atlas_tool_assemblies', 'atlas_tool_machine_assignments', 'atlas_operation_tool_requirements', 'atlas_operation_tool_executions', 'atlas_tool_identifiers', 'atlas_wip_bins', 'atlas_wip_bin_assignments', 'atlas_wip_bin_location_events', 'atlas_wip_bin_identifiers']);

const safe = (state, code) => Object.freeze({ state, code });
const pass = (code = 'OK') => safe('PASS', code);
const skipped = (code) => safe('NOT_APPLICABLE', code);
const failed = (code) => safe('FAIL', code);

function expectedTenant(value) { return typeof value === 'string' && value.length > 0 && !value.startsWith('PLATFORM_'); }
function parseVersion(value) { const number = Number(String(value || '').split('.')[0]); return Number.isInteger(number) ? number : null; }
function result(state, remediationCode, checks) { return Object.freeze({ state, remediationCode, checks: Object.freeze(checks) }); }

/**
 * Inspect-only readiness boundary for a server-configured tenant PostgreSQL
 * installation. It intentionally accepts no browser request data and never
 * invokes the migration runner's mutating apply method.
 */
export class PostgresInstallationReadinessValidator {
  constructor({ applicationRuntime, migrationRuntime, migrations, expectedTenantId, provider = 'POSTGRESQL', versionProbe, roleProbe } = {}) {
    this.applicationRuntime = applicationRuntime;
    this.migrationRuntime = migrationRuntime;
    this.migrations = migrations;
    this.expectedTenantId = expectedTenantId;
    this.provider = provider;
    this.versionProbe = versionProbe || defaultVersionProbe;
    this.roleProbe = roleProbe || defaultRoleProbe;
  }

  async inspect() {
    const checks = this.blankChecks();
    if (this.provider !== 'POSTGRESQL' || !expectedTenant(this.expectedTenantId) || !this.applicationRuntime || !this.migrationRuntime || !this.migrations) {
      return result('CONFIGURATION_ERROR', 'READINESS_CONFIGURATION_INVALID', { ...checks, configuration: failed('READINESS_CONFIGURATION_INVALID') });
    }
    if (!this.tlsValid()) return result('SECURITY_ERROR', 'TLS_CONFIGURATION_INVALID', { ...checks, tls: failed('TLS_CONFIGURATION_INVALID') });
    if (this.applicationRuntime.config.user === this.migrationRuntime.config.user) return result('SECURITY_ERROR', 'DATABASE_ROLES_NOT_DISTINCT', { ...checks, applicationRole: failed('DATABASE_ROLES_NOT_DISTINCT'), migrationRole: failed('DATABASE_ROLES_NOT_DISTINCT') });

    try { await this.applicationRuntime.query('SELECT 1 AS ready', [], 'INSTALLATION_READINESS_CONNECTIVITY'); checks.connectivity = pass('DATABASE_REACHABLE'); }
    catch { return result('DATABASE_UNAVAILABLE', 'DATABASE_UNAVAILABLE', { ...checks, connectivity: failed('DATABASE_UNAVAILABLE') }); }

    try {
      const major = parseVersion(await this.versionProbe(this.applicationRuntime));
      if (major !== 17) return result('INCOMPATIBLE', major === 18 ? 'POSTGRESQL_18_CERTIFICATION_REQUIRED' : 'POSTGRESQL_VERSION_UNSUPPORTED', { ...checks, version: failed(major === 18 ? 'POSTGRESQL_18_CERTIFICATION_REQUIRED' : 'POSTGRESQL_VERSION_UNSUPPORTED') });
      checks.version = pass('POSTGRESQL_17_SUPPORTED');
    } catch { return result('CONFIGURATION_ERROR', 'POSTGRESQL_VERSION_UNAVAILABLE', { ...checks, version: failed('POSTGRESQL_VERSION_UNAVAILABLE') }); }

    try {
      const metadataExists = await this.tableExists('atlas_schema_migrations');
      const roles = await this.inspectRoles(metadataExists);
      checks.applicationRole = roles.applicationRole;
      checks.migrationRole = roles.migrationRole;
      if (roles.applicationRole.state === 'FAIL' || roles.migrationRole.state === 'FAIL') return result('SECURITY_ERROR', roles.applicationRole.state === 'FAIL' ? roles.applicationRole.code : roles.migrationRole.code, checks);
      if (!metadataExists) return result('INITIALIZATION_REQUIRED', 'ATLAS_SCHEMA_UNINITIALIZED', { ...checks, installation: skipped('ATLAS_SCHEMA_UNINITIALIZED'), migration: skipped('ATLAS_SCHEMA_UNINITIALIZED'), foundationSchema: skipped('ATLAS_SCHEMA_UNINITIALIZED'), domainSchema: skipped('ATLAS_SCHEMA_UNINITIALIZED'), sessionSchema: skipped('ATLAS_SCHEMA_UNINITIALIZED'), transactionSmoke: skipped('ATLAS_SCHEMA_UNINITIALIZED'), tenantScope: skipped('ATLAS_SCHEMA_UNINITIALIZED') });

      const installation = await this.inspectInstallation(); checks.installation = installation;
      checks.tenantScope = installation.state === 'PASS' ? pass('TENANT_SCOPE_MATCHED') : installation;
      if (installation.state === 'FAIL') return result(installation.code === 'INSTALLATION_EMPTY' ? 'INITIALIZATION_REQUIRED' : 'SECURITY_ERROR', installation.code, checks);

      const migration = await this.migrations.status(); checks.migration = this.mapMigration(migration);
      if (checks.migration.state === 'FAIL') return result(this.migrationResultState(checks.migration.code), checks.migration.code, checks);

      checks.foundationSchema = await this.inspectTables(FOUNDATION_TABLES, 'FOUNDATION_SCHEMA');
      checks.domainSchema = await this.inspectTables(DOMAIN_TABLES, 'DOMAIN_SCHEMA');
      checks.sessionSchema = await this.inspectTables(['atlas_auth_sessions'], 'SESSION_SCHEMA');
      if (checks.foundationSchema.state === 'FAIL' || checks.domainSchema.state === 'FAIL' || checks.sessionSchema.state === 'FAIL') return result('INCOMPATIBLE', 'SCHEMA_STRUCTURE_INCOMPLETE', checks);
      await this.applicationRuntime.rollbackSmoke('INSTALLATION_READINESS_TRANSACTION_SMOKE'); checks.transactionSmoke = pass('TRANSACTION_ROLLBACK_PROVEN');
      return result('READY', 'READY', checks);
    } catch { return result('DATABASE_UNAVAILABLE', 'READINESS_INSPECTION_UNAVAILABLE', checks); }
  }

  blankChecks() {
    return { configuration: pass('SERVER_CONTROLLED'), connectivity: skipped('NOT_RUN'), version: skipped('NOT_RUN'), tls: pass('TLS_CONFIGURATION_VALID'), installation: skipped('NOT_RUN'), applicationRole: skipped('NOT_RUN'), migrationRole: skipped('NOT_RUN'), migration: skipped('NOT_RUN'), foundationSchema: skipped('NOT_RUN'), domainSchema: skipped('NOT_RUN'), sessionSchema: skipped('NOT_RUN'), transactionSmoke: skipped('NOT_RUN'), tenantScope: skipped('NOT_RUN') };
  }
  tlsValid() {
    return !(this.applicationRuntime.config.production || this.migrationRuntime.config.production) || (this.applicationRuntime.config.tls.required === true && this.applicationRuntime.config.tls.rejectUnauthorized === true && this.migrationRuntime.config.tls.required === true && this.migrationRuntime.config.tls.rejectUnauthorized === true);
  }
  async inspectRoles(metadataExists) {
    const [application, migration] = await Promise.all([this.roleProbe(this.applicationRuntime, metadataExists), this.roleProbe(this.migrationRuntime, metadataExists)]);
    return {
      applicationRole: application.isSuperuser || application.canCreateSchema || application.ownsSchema || (metadataExists && application.canWriteMigrationMetadata) ? failed('APPLICATION_ROLE_OVERPRIVILEGED') : pass('APPLICATION_ROLE_LEAST_PRIVILEGE'),
      migrationRole: migration.isSuperuser || !migration.canCreateSchema || (metadataExists && !migration.canWriteMigrationMetadata) ? failed('MIGRATION_ROLE_INSUFFICIENT_OR_OVERPRIVILEGED') : pass('MIGRATION_ROLE_SEPARATE_AND_READY')
    };
  }
  async tableExists(tableName) {
    const query = "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1";
    return (await this.applicationRuntime.query(query, [tableName], 'INSTALLATION_READINESS_TABLE')).rows.length === 1;
  }
  async inspectInstallation() {
    if (!(await this.tableExists('atlas_installation'))) return failed('INSTALLATION_METADATA_MISSING');
    const rows = (await this.applicationRuntime.query('SELECT installation_id, tenant_id FROM atlas_installation ORDER BY installation_id ASC LIMIT 2', [], 'INSTALLATION_READINESS_IDENTITY')).rows;
    if (rows.length === 0) return failed('INSTALLATION_EMPTY');
    if (rows.length !== 1 || !rows[0].installation_id || !rows[0].tenant_id) return failed('INSTALLATION_METADATA_MALFORMED');
    return rows[0].tenant_id === this.expectedTenantId ? pass('INSTALLATION_TENANT_MATCHED') : failed('INSTALLATION_TENANT_MISMATCH');
  }
  async inspectTables(required, prefix) {
    const found = new Set((await this.applicationRuntime.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${required.map((_, index) => `$${index + 1}`).join(',')})`, required, `INSTALLATION_READINESS_${prefix}`)).rows.map((row) => row.table_name));
    return required.every((name) => found.has(name)) ? pass(`${prefix}_PRESENT`) : failed(`${prefix}_MISSING`);
  }
  mapMigration(migration) {
    if (migration.state === 'CURRENT') return pass('MIGRATIONS_CURRENT');
    if (migration.state === 'CHECKSUM_MISMATCH') return failed('MIGRATION_CHECKSUM_DRIFT');
    if (migration.state === 'SCHEMA_AHEAD') return failed('SCHEMA_AHEAD_INCOMPATIBLE');
    if (migration.state === 'MIGRATION_INCOMPLETE') return failed('MIGRATION_INCOMPLETE');
    return failed('MIGRATION_REQUIRED');
  }
  migrationResultState(code) { return code === 'MIGRATION_REQUIRED' ? 'MIGRATION_REQUIRED' : code === 'MIGRATION_INCOMPLETE' ? 'UPGRADE_REQUIRED' : code === 'MIGRATION_CHECKSUM_DRIFT' ? 'CONFIGURATION_ERROR' : 'INCOMPATIBLE'; }
}

async function defaultVersionProbe(runtime) {
  const row = (await runtime.query("SELECT current_setting('server_version_num', true) AS version_num", [], 'INSTALLATION_READINESS_VERSION')).rows[0];
  return Number(row?.version_num || 0) / 10000;
}

async function defaultRoleProbe(runtime, metadataExists) {
  const metadata = metadataExists ? "has_table_privilege(current_user, 'atlas_schema_migrations', 'INSERT') OR has_table_privilege(current_user, 'atlas_schema_migrations', 'UPDATE') OR has_table_privilege(current_user, 'atlas_schema_migrations', 'DELETE')" : 'false';
  const query = `SELECT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS is_superuser, has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create_schema, COALESCE((SELECT pg_get_userbyid(nspowner) = current_user FROM pg_namespace WHERE nspname = current_schema()), false) AS owns_schema, ${metadata} AS can_write_migration_metadata`;
  const row = (await runtime.query(query, [], 'INSTALLATION_READINESS_ROLE')).rows[0] || {};
  return { isSuperuser: row.is_superuser === true, canCreateSchema: row.can_create_schema === true, ownsSchema: row.owns_schema === true, canWriteMigrationMetadata: row.can_write_migration_metadata === true };
}
