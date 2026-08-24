import { errors } from './errors.js';
import { equalsHash, hash, randomOpaque } from './security.js';

export class PreproductionMemorySessionStore {
  constructor({ clock = () => new Date(), enabled = true } = {}) {
    this.clock = clock;
    this.enabled = enabled;
    this.records = new Map();
  }
  assertAvailable() { if (!this.enabled) throw errors.sessionStoreUnavailable(); }
  async create(record) { this.assertAvailable(); this.records.set(record.id, structuredClone(record)); return structuredClone(record); }
  async getByOpaque(opaque) {
    this.assertAvailable();
    for (const record of this.records.values()) if (equalsHash(opaque, record.opaqueHash)) return structuredClone(record);
    return null;
  }
  async get(id) { this.assertAvailable(); return this.records.has(id) ? structuredClone(this.records.get(id)) : null; }
  async update(id, changes) {
    this.assertAvailable(); const record = this.records.get(id); if (!record) return null;
    Object.assign(record, structuredClone(changes), { updatedAt: this.clock().toISOString() }); return structuredClone(record);
  }
  async listActiveForUser(userId, limit = 50) {
    this.assertAvailable(); return [...this.records.values()].filter((record) => record.userId === userId && record.status === 'ACTIVE').slice(0, limit).map(structuredClone);
  }
  async revokeAllForUser(userId, reason = 'ADMIN_REVOKED') {
    this.assertAvailable(); let count = 0;
    for (const record of this.records.values()) if (record.userId === userId && ['ACTIVE', 'PENDING_TENANT'].includes(record.status)) {
      Object.assign(record, { status: 'REVOKED', revokedAt: this.clock().toISOString(), revocationReason: reason }); count += 1;
    }
    return count;
  }
  async cleanupExpired() {
    this.assertAvailable(); const now = this.clock().getTime(); let count = 0;
    for (const record of this.records.values()) if (record.status !== 'REVOKED' && new Date(record.absoluteExpiresAt).getTime() <= now) {
      Object.assign(record, { status: 'EXPIRED', expiredAt: this.clock().toISOString() }); count += 1;
    }
    return count;
  }
}

export class ProductionSessionStoreUnavailable {
  async create() { throw errors.sessionStoreUnavailable(); }
  async getByOpaque() { throw errors.sessionStoreUnavailable(); }
  async get() { throw errors.sessionStoreUnavailable(); }
  async update() { throw errors.sessionStoreUnavailable(); }
  async listActiveForUser() { throw errors.sessionStoreUnavailable(); }
  async revokeAllForUser() { throw errors.sessionStoreUnavailable(); }
  async cleanupExpired() { throw errors.sessionStoreUnavailable(); }
}

export class PreproductionAuthAttemptStore {
  constructor({ clock = () => new Date(), enabled = true } = {}) { this.clock = clock; this.enabled = enabled; this.records = new Map(); }
  assertAvailable() { if (!this.enabled) throw errors.sessionStoreUnavailable(); }
  async create({ provider, route, browserBinding, timeoutSeconds }) {
    this.assertAvailable();
    const state = randomOpaque(32), nonce = randomOpaque(32), verifier = randomOpaque(48), now = this.clock();
    const record = { id: `attempt-${randomOpaque(18)}`, stateHash: hash(state), nonce, verifier, provider, route, browserBindingHash: hash(browserBinding), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + timeoutSeconds * 1000).toISOString(), consumedAt: '' };
    this.records.set(record.stateHash, record); return { state, nonce, verifier, provider, route, expiresAt: record.expiresAt };
  }
  async consume({ state, browserBinding }) {
    this.assertAvailable(); const stateHash = hash(state), record = this.records.get(stateHash);
    this.records.delete(stateHash);
    if (!record || record.consumedAt || !equalsHash(browserBinding, record.browserBindingHash) || new Date(record.expiresAt).getTime() <= this.clock().getTime()) throw errors.invalidCallback();
    record.consumedAt = this.clock().toISOString(); return structuredClone(record);
  }
}

export class SessionService {
  constructor({ store, clock = () => new Date(), policy }) { this.store = store; this.clock = clock; this.policy = policy; }
  async create({ userId, provider, issuer, subject, permittedTenants, activeTenant = '', authenticatedAt, authenticationContext = 'OIDC' }) {
    const created = this.build({ userId, provider, issuer, subject, permittedTenants, activeTenant, authenticatedAt, authenticationContext }); await this.store.create(created.record); return created;
  }
  async resolve(opaque, { allowPending = false } = {}) {
    const record = await this.store.getByOpaque(opaque), now = this.clock().getTime();
    if (!record) throw errors.unauthenticated();
    if (record.status === 'REVOKED') throw errors.revoked();
    if (record.status === 'EXPIRED' || new Date(record.absoluteExpiresAt).getTime() <= now || new Date(record.idleExpiresAt).getTime() <= now) {
      await this.store.update(record.id, { status: 'EXPIRED', expiredAt: this.clock().toISOString() }); throw errors.expired();
    }
    if (!allowPending && (record.status !== 'ACTIVE' || !record.activeTenant)) throw errors.accessUnavailable();
    return record;
  }
  async touch(record) {
    const now = this.clock(); if (new Date(record.absoluteExpiresAt).getTime() <= now.getTime()) throw errors.expired();
    const idleExpiresAt = new Date(Math.min(now.getTime() + this.policy.idleSeconds * 1000, new Date(record.absoluteExpiresAt).getTime()));
    return this.store.touch ? this.store.touch(record.id, now, idleExpiresAt) : this.store.update(record.id, { lastActivityAt: now.toISOString(), idleExpiresAt: idleExpiresAt.toISOString() });
  }
  async validateCsrf(record, csrf) { if (!csrf || !equalsHash(csrf, record.csrfHash)) throw errors.csrf(); }
  async rotateCsrf(record) { const csrf = randomOpaque(32); await this.store.update(record.id, { csrfHash: hash(csrf) }); return csrf; }
  async rotate(record, activeTenant) {
    const created = this.build({ userId: record.userId, provider: record.provider, issuer: record.issuer, subject: record.subject, permittedTenants: record.permittedTenants, activeTenant, authenticatedAt: record.authenticatedAt, authenticationContext: record.authenticationContext });
    if (this.store.rotate) return { ...created, record: await this.store.rotate(record.id, created.record) };
    await this.store.create(created.record);
    await this.store.update(record.id, { status: 'REVOKED', revokedAt: this.clock().toISOString(), revocationReason: 'ROTATED', replacedBy: created.record.id }); return created;
  }
  build({ userId, provider, issuer, subject, permittedTenants, activeTenant = '', authenticatedAt, authenticationContext = 'OIDC' }) {
    const now = this.clock(), opaque = randomOpaque(48), id = `session-${randomOpaque(18)}`, csrf = randomOpaque(32);
    const record = { id, opaqueHash: hash(opaque), csrfHash: hash(csrf), userId, provider, issuer, subject, permittedTenants: [...permittedTenants], activeTenant, issuedAt: now.toISOString(), authenticatedAt: new Date(authenticatedAt || now).toISOString(), lastActivityAt: now.toISOString(), idleExpiresAt: new Date(now.getTime() + this.policy.idleSeconds * 1000).toISOString(), absoluteExpiresAt: new Date(now.getTime() + this.policy.absoluteSeconds * 1000).toISOString(), revokedAt: '', revocationReason: '', status: activeTenant ? 'ACTIVE' : 'PENDING_TENANT', version: 1, authenticationContext };
    return { record, opaque, csrf };
  }
  async revoke(record, reason = 'LOGOUT') { return this.store.update(record.id, { status: 'REVOKED', revokedAt: this.clock().toISOString(), revocationReason: reason }); }
}
