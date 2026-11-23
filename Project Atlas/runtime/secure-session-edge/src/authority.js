import { errors } from './errors.js';

function identityKey(provider, issuer, subject) { return `${provider}|${issuer}|${subject}`; }
function noPlatformCapabilities(values) { return (values || []).filter((value) => !String(value).startsWith('PLATFORM_')); }

/**
 * Contract implemented by the future tenant API/PostgreSQL adapter. Fixture data is
 * preproduction-only and deliberately re-resolves user/membership/capability state
 * on every protected request.
 */
export class AtlasAuthority {
  constructor({ identities = [], users = [], memberships = [], entitlement = () => true } = {}) {
    this.identities = new Map(identities.map((item) => [identityKey(item.provider, item.issuer, item.subject), item]));
    this.users = new Map(users.map((item) => [item.id, item])); this.memberships = memberships; this.entitlement = entitlement;
  }
  resolveIdentity(provider, issuer, subject) { return this.identities.get(identityKey(provider, issuer, subject)) || null; }
  resolveUser(id) { return this.users.get(id) || null; }
  permittedTenants(userId) {
    return this.memberships.filter((item) => item.userId === userId && item.status === 'ACTIVE' && this.entitlement({ tenantId: item.tenantId, userId, operation: 'SIGN_IN' }) === true).map((item) => item.tenantId);
  }
  authorize({ userId, tenantId, requiredCapability, operation }) {
    const user = this.resolveUser(userId); if (!user || user.status !== 'ACTIVE') throw errors.accessUnavailable();
    const membership = this.memberships.find((item) => item.userId === userId && item.tenantId === tenantId && item.status === 'ACTIVE');
    if (!membership) throw errors.accessUnavailable();
    let entitlement;
    try { entitlement = this.entitlement({ tenantId, userId, operation }); } catch { throw errors.entitlementUnavailable(); }
    if (entitlement !== true) throw errors.accessUnavailable();
    const capabilities = noPlatformCapabilities(membership.capabilities);
    if (requiredCapability && !capabilities.includes(requiredCapability)) throw errors.forbidden();
    return Object.freeze({ userId, tenantId, authenticated: true, authoritative: true, membershipId: membership.id || '', capabilities, operation });
  }
  canUseTenant({ userId, tenantId }) { return this.permittedTenants(userId).includes(tenantId) && !!this.authorize({ userId, tenantId, operation: 'TENANT_SWITCH' }); }
}

/** PostgreSQL authority for the tenant runtime. All identity, tenant, membership,
 * and capability values are re-derived server-side for each protected request. */
export class PostgresAtlasAuthority {
  constructor({ runtime, entitlement = async () => true } = {}) {
    if (!runtime?.query) throw new Error('PostgreSQL authority configuration is unavailable.');
    this.runtime = runtime;
    this.entitlement = entitlement;
  }
  async resolveIdentity(provider, issuer, subject) {
    const result = await this.runtime.query("SELECT external_identity_id,user_id,provider,issuer,subject,status FROM atlas_external_identities WHERE provider=$1 AND issuer=$2 AND subject=$3 AND status='ACTIVE' LIMIT 1", [provider, issuer, subject], 'AUTHORITY_IDENTITY');
    const row = result.rows[0];
    return row ? { id: row.external_identity_id, userId: row.user_id, provider: row.provider, issuer: row.issuer, subject: row.subject, status: row.status } : null;
  }
  async resolveUser(id) {
    const row = (await this.runtime.query('SELECT user_id,status FROM atlas_users WHERE user_id=$1 LIMIT 1', [id], 'AUTHORITY_USER')).rows[0];
    return row ? { id: row.user_id, status: row.status } : null;
  }
  async permittedTenants(userId) {
    const rows = (await this.runtime.query("SELECT tenant_id FROM atlas_tenant_memberships WHERE user_id=$1 AND status='ACTIVE' ORDER BY tenant_id ASC LIMIT 100", [userId], 'AUTHORITY_TENANTS')).rows;
    const permitted = [];
    for (const row of rows) {
      if (String(row.tenant_id).startsWith('PLATFORM_')) continue;
      let allowed;
      try { allowed = await this.entitlement({ tenantId: row.tenant_id, userId, operation: 'SIGN_IN' }); } catch { throw errors.entitlementUnavailable(); }
      if (allowed === true) permitted.push(row.tenant_id);
    }
    return permitted;
  }
  async authorize({ userId, tenantId, requiredCapability, operation }) {
    if (!tenantId || String(tenantId).startsWith('PLATFORM_')) throw errors.accessUnavailable();
    const row = (await this.runtime.query("SELECT u.status AS user_status,m.membership_id,m.status AS membership_status,m.capabilities_json FROM atlas_users u JOIN atlas_tenant_memberships m ON m.user_id=u.user_id WHERE u.user_id=$1 AND m.tenant_id=$2 LIMIT 1", [userId, tenantId], 'AUTHORITY_AUTHORIZE')).rows[0];
    if (!row || row.user_status !== 'ACTIVE' || row.membership_status !== 'ACTIVE') throw errors.accessUnavailable();
    let entitled;
    try { entitled = await this.entitlement({ tenantId, userId, operation }); } catch { throw errors.entitlementUnavailable(); }
    if (entitled !== true) throw errors.accessUnavailable();
    const capabilities = noPlatformCapabilities(Array.isArray(row.capabilities_json) ? row.capabilities_json : []);
    if (requiredCapability && !capabilities.includes(requiredCapability)) throw errors.forbidden();
    return Object.freeze({ userId, tenantId, authenticated: true, authoritative: true, membershipId: row.membership_id, capabilities, operation });
  }
  async canUseTenant({ userId, tenantId }) {
    const permitted = await this.permittedTenants(userId);
    return permitted.includes(tenantId) && !!(await this.authorize({ userId, tenantId, operation: 'TENANT_SWITCH' }));
  }
}
