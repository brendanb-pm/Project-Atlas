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
    return Object.freeze({ userId, tenantId, authenticated: true, membershipId: membership.id || '', capabilities, operation });
  }
  canUseTenant({ userId, tenantId }) { return this.permittedTenants(userId).includes(tenantId) && !!this.authorize({ userId, tenantId, operation: 'TENANT_SWITCH' }); }
}
