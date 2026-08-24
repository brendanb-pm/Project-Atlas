import { createServer } from 'node:http';
import { EdgeError, errors, safeError } from './errors.js';
import { cookie, correlationId, hash, parseCookies, randomOpaque, safeRoute, securityHeaders, validOpaque } from './security.js';
import { PreproductionAuthAttemptStore, PreproductionMemorySessionStore, ProductionSessionStoreUnavailable, SessionService } from './store.js';

const SESSION_COOKIE = 'atlas_session';
const FLOW_COOKIE = 'atlas_auth_flow';
const MAX_BODY = 8192;

export function createEdgeConfig(input = {}) {
  const environment = input.environment || 'preproduction';
  const production = environment === 'production';
  if (!['development', 'test', 'preproduction', 'production'].includes(environment) || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(input.origin || '')) throw new Error('Secure-session edge configuration is invalid.');
  if (production && input.preproductionTestHarness) throw new Error('Preproduction test routes cannot be enabled in production.');
  if (production && input.sessionStoreKind === 'memory') throw new Error('Production requires a PostgreSQL-backed session store.');
  const policy = input.policy || {};
  for (const value of [policy.idleSeconds ?? 1800, policy.absoluteSeconds ?? 28800, policy.attemptSeconds ?? 300]) if (!Number.isInteger(value) || value < 60 || value > 86400) throw new Error('Secure-session timing policy is invalid.');
  return Object.freeze({ environment, production, origin: input.origin, allowedRoutes: Object.freeze(input.allowedRoutes || ['home']), providers: input.providers || {}, preproductionTestHarness: input.preproductionTestHarness === true, sessionStoreKind: input.sessionStoreKind || (production ? 'postgresql-required' : 'memory'), policy: Object.freeze({ idleSeconds: policy.idleSeconds ?? 1800, absoluteSeconds: policy.absoluteSeconds ?? 28800, attemptSeconds: policy.attemptSeconds ?? 300 }), rateLimit: Object.freeze(input.rateLimit || { windowMs: 60000, max: 30 }) });
}

export class MemoryAuditSink {
  constructor() { this.events = []; }
  async write(event) { this.events.push(Object.freeze({ ...event })); }
}

export class SlidingRateLimiter {
  constructor({ clock = () => new Date(), policy } = {}) { this.clock = clock; this.policy = policy; this.events = new Map(); }
  consume(key) {
    if (!this.policy || !Number.isInteger(this.policy.max) || this.policy.max < 1 || !Number.isInteger(this.policy.windowMs) || this.policy.windowMs < 1000) throw errors.providerUnavailable();
    const now = this.clock().getTime(), threshold = now - this.policy.windowMs, items = (this.events.get(key) || []).filter((value) => value > threshold);
    if (items.length >= this.policy.max) throw new EdgeError('RATE_LIMITED', 'Try again shortly.', 429);
    items.push(now); this.events.set(key, items);
  }
}

export function createPreproductionEdge({ config: rawConfig, providers, authority, sessionStore, attemptStore, audit = new MemoryAuditSink(), clock = () => new Date(), limiter } = {}) {
  const config = createEdgeConfig(rawConfig);
  if (!authority || !providers) throw new Error('Secure-session edge dependencies are required.');
  if (config.production && Object.values(providers).some((provider) => provider?.isTestAdapter === true)) throw new Error('Test providers cannot be selected in production.');
  if (config.production && sessionStore instanceof PreproductionMemorySessionStore) throw new Error('Preproduction session storage cannot be selected in production.');
  if (config.production && attemptStore instanceof PreproductionAuthAttemptStore) throw new Error('Preproduction auth-attempt storage cannot be selected in production.');
  const actualSessionStore = sessionStore || (config.production ? new ProductionSessionStoreUnavailable() : new PreproductionMemorySessionStore({ clock }));
  const actualAttemptStore = attemptStore || new PreproductionAuthAttemptStore({ clock, enabled: !config.production || config.sessionStoreKind === 'postgresql' });
  const sessions = new SessionService({ store: actualSessionStore, clock, policy: config.policy });
  const rateLimiter = limiter || new SlidingRateLimiter({ clock, policy: config.rateLimit });
  return { config, providers, authority, sessions, attempts: actualAttemptStore, audit, clock, rateLimiter, handler: createHandler({ config, providers, authority, sessions, attempts: actualAttemptStore, audit, clock, rateLimiter }) };
}

export function createHttpServer(edge) { return createServer(edge.handler); }

function createHandler(deps) {
  return async (request, response) => {
    const requestId = correlationId(), url = new URL(request.url, deps.config.origin), route = `${request.method} ${url.pathname}`;
    try {
      setHeaders(response, deps.config); if (request.method === 'OPTIONS') throw errors.notFound();
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
      if (request.method === 'GET' && url.pathname === '/auth/providers') return sendJson(response, 200, { providers: Object.values(deps.config.providers).filter((item) => item.enabled).map((item) => ({ id: item.id, label: item.id === 'MICROSOFT' ? 'Continue with Microsoft' : 'Continue with Google' })) });
      if (request.method === 'POST' && url.pathname === '/auth/start') return await begin(request, response, deps, requestId);
      if (request.method === 'GET' && url.pathname === '/auth/callback') return await callback(request, response, deps, url, requestId);
      if (request.method === 'GET' && url.pathname === '/session/status') return await status(request, response, deps, requestId);
      if (request.method === 'POST' && url.pathname === '/auth/tenant-select') return await selectTenant(request, response, deps, requestId);
      if (request.method === 'POST' && url.pathname === '/auth/logout') return await logout(request, response, deps, requestId);
      if (request.method === 'GET' && url.pathname === '/preproduction/context') return await contextHarness(request, response, deps, requestId);
      throw errors.notFound();
    } catch (error) {
      const safe = safeError(error); await audit(deps, requestId, 'REQUEST_FAILURE', safe.code, { route });
      if (safe.code === 'SESSION_EXPIRED' || safe.code === 'SESSION_REVOKED') clearSession(response, deps.config);
      return sendJson(response, safe.status, { state: stateFor(safe.code), message: safe.message, correlationId: requestId });
    }
  };
}

async function begin(request, response, deps, requestId) {
  deps.rateLimiter.consume(`start:${remoteKey(request)}`); const body = await jsonBody(request), providerId = String(body.provider || '').toUpperCase();
  const provider = deps.providers[providerId], config = deps.config.providers[providerId]; if (!provider || !config?.enabled) throw errors.providerUnavailable();
  const browserBinding = randomOpaque(32), route = safeRoute(body.intendedRoute, deps.config.allowedRoutes);
  const attempt = await deps.attempts.create({ provider: providerId, route, browserBinding, timeoutSeconds: deps.config.policy.attemptSeconds });
  const authorizationUrl = provider.authorizationUrl(attempt); if (!String(authorizationUrl).startsWith('https://')) throw errors.providerUnavailable();
  response.setHeader('Set-Cookie', cookie(FLOW_COOKIE, browserBinding, { secure: deps.config.production, path: '/auth/callback', maxAge: deps.config.policy.attemptSeconds }));
  await audit(deps, requestId, 'LOGIN_STARTED', 'STARTED', { provider: providerId }); return sendJson(response, 200, { authorizationUrl, expiresAt: attempt.expiresAt, correlationId: requestId });
}

async function callback(request, response, deps, url, requestId) {
  deps.rateLimiter.consume(`callback:${remoteKey(request)}`); const cookies = parseCookies(request.headers.cookie), state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '';
  if (!validOpaque(state) || !code || code.length > 4096 || !cookies[FLOW_COOKIE]) throw errors.invalidCallback();
  let attempt;
  try { attempt = await deps.attempts.consume({ state, browserBinding: cookies[FLOW_COOKIE] }); } catch (error) { await audit(deps, requestId, 'CALLBACK_REJECTED', error.code || 'INVALID_CALLBACK'); throw error; }
  const provider = deps.providers[attempt.provider]; if (!provider) throw errors.providerUnavailable();
  let principal;
  try { principal = await provider.complete({ code, attempt }); } catch (error) { await audit(deps, requestId, 'LOGIN_FAILURE', error.code || 'INVALID_CALLBACK', { provider: attempt.provider }); throw error; }
  const identity = deps.authority.resolveIdentity(principal.provider, principal.issuer, principal.subject);
  const user = identity && deps.authority.resolveUser(identity.userId);
  if (!identity || !user || user.status !== 'ACTIVE') { await audit(deps, requestId, 'LOGIN_FAILURE', 'IDENTITY_NOT_PROVISIONED', { provider: attempt.provider }); return sendJson(response, 403, { state: 'ACCESS_UNAVAILABLE', message: 'Access is unavailable.', correlationId: requestId }); }
  let permitted;
  try { permitted = deps.authority.permittedTenants(user.id); } catch { throw errors.entitlementUnavailable(); }
  if (!permitted.length) { await audit(deps, requestId, 'LOGIN_FAILURE', 'NO_PERMITTED_TENANT', { provider: attempt.provider }); return sendJson(response, 403, { state: 'ACCESS_UNAVAILABLE', message: 'Access is unavailable.', correlationId: requestId }); }
  const activeTenant = permitted.length === 1 ? permitted[0] : '';
  const created = await deps.sessions.create({ userId: user.id, provider: principal.provider, issuer: principal.issuer, subject: principal.subject, permittedTenants: permitted, activeTenant, authenticatedAt: principal.authenticatedAt, authenticationContext: principal.authenticationContext });
  response.setHeader('Set-Cookie', [cookie(SESSION_COOKIE, created.opaque, { secure: deps.config.production, maxAge: deps.config.policy.absoluteSeconds }), cookie(FLOW_COOKIE, '', { secure: deps.config.production, path: '/auth/callback', maxAge: 0 })]);
  await audit(deps, requestId, 'LOGIN_SUCCESS', 'SESSION_CREATED', { provider: principal.provider, session: created.record.id });
  return sendJson(response, 200, { state: activeTenant ? 'SIGNED_IN' : 'TENANT_SELECTION_REQUIRED', returnRoute: attempt.route, csrfToken: created.csrf, correlationId: requestId });
}

async function status(request, response, deps, requestId) {
  const record = await resolveSession(request, deps); const context = authorize(deps, record, 'SESSION_STATUS', 'CORE_RECORD_READ'); await deps.sessions.touch(record);
  const csrf = await deps.sessions.rotateCsrf(record); await audit(deps, requestId, 'SESSION_STATUS', 'AUTHORIZED', { session: record.id });
  return sendJson(response, 200, { state: 'AUTHENTICATED', activeTenant: context.tenantId, csrfToken: csrf, correlationId: requestId });
}

async function selectTenant(request, response, deps, requestId) {
  requireOrigin(request, deps.config); const record = await resolveSession(request, deps, true), body = await jsonBody(request); await deps.sessions.validateCsrf(record, request.headers['x-atlas-csrf']);
  const tenantId = String(body.tenantId || ''); if (!validTenant(tenantId) || !record.permittedTenants.includes(tenantId)) { await audit(deps, requestId, 'TENANT_SWITCH_REJECTED', 'FORBIDDEN_TENANT', { session: record.id }); throw errors.forbidden(); }
  try { authorize(deps, { ...record, activeTenant: tenantId }, 'TENANT_SWITCH', 'CORE_RECORD_READ'); } catch (error) { await audit(deps, requestId, 'TENANT_SWITCH_REJECTED', error.code || 'ACCESS_UNAVAILABLE', { session: record.id }); throw error; }
  const rotated = await deps.sessions.rotate(record, tenantId); response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, rotated.opaque, { secure: deps.config.production, maxAge: deps.config.policy.absoluteSeconds }));
  await audit(deps, requestId, 'TENANT_SWITCHED', 'ROTATED', { session: rotated.record.id }); return sendJson(response, 200, { state: 'AUTHENTICATED', activeTenant: tenantId, csrfToken: rotated.csrf, correlationId: requestId });
}

async function logout(request, response, deps, requestId) {
  requireOrigin(request, deps.config); const record = await resolveSession(request, deps, true); await deps.sessions.validateCsrf(record, request.headers['x-atlas-csrf']); await deps.sessions.revoke(record, 'LOGOUT'); clearSession(response, deps.config);
  await audit(deps, requestId, 'LOGOUT', 'REVOKED', { session: record.id }); return sendJson(response, 200, { state: 'SIGNED_OUT', correlationId: requestId });
}

async function contextHarness(request, response, deps, requestId) {
  if (!deps.config.preproductionTestHarness || deps.config.production) throw errors.notFound();
  const record = await resolveSession(request, deps), context = authorize(deps, record, 'PREPRODUCTION_CONTEXT', 'CORE_RECORD_READ'); await deps.sessions.touch(record);
  return sendJson(response, 200, { state: 'AUTHORIZED', activeTenant: context.tenantId, authenticatedUser: context.userId, correlationId: requestId });
}

function authorize(deps, record, operation, requiredCapability) {
  return deps.authority.authorize({ userId: record.userId, tenantId: record.activeTenant, operation, requiredCapability });
}
async function resolveSession(request, deps, allowPending = false) { return deps.sessions.resolve(parseCookies(request.headers.cookie)[SESSION_COOKIE] || '', { allowPending }); }
function requireOrigin(request, config) { const origin = request.headers.origin || request.headers.referer?.replace(/^(https:\/\/[^/]+).*$/, '$1'); if (origin !== config.origin) throw errors.csrf(); }
function validTenant(value) { return /^[A-Za-z0-9_-]{1,160}$/.test(value); }
function remoteKey(request) { return String(request.socket.remoteAddress || 'unknown').slice(0, 128); }
function clearSession(response, config) { response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { secure: config.production, maxAge: 0 })); }
function setHeaders(response, config) { for (const [key, value] of Object.entries(securityHeaders(config))) response.setHeader(key, value); }
function sendJson(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
function stateFor(code) { return ({ UNAUTHENTICATED: 'SIGNED_OUT', SESSION_EXPIRED: 'SESSION_EXPIRED', SESSION_REVOKED: 'SESSION_EXPIRED', INVALID_CSRF: 'AUTHENTICATION_FAILED', PROVIDER_UNAVAILABLE: 'PROVIDER_TEMPORARILY_UNAVAILABLE', ENTITLEMENT_UNAVAILABLE: 'ACCESS_UNAVAILABLE' }[code] || 'AUTHENTICATION_FAILED'); }
async function jsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) throw errors.invalidInput(); chunks.push(chunk); }
  if (!chunks.length) return {}; try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; } catch { throw errors.invalidInput(); }
}
async function audit(deps, correlationId, operation, outcome, extra = {}) {
  await deps.audit.write({ occurredAt: deps.clock().toISOString(), correlationId, operation, outcome, provider: extra.provider || '', sessionReference: extra.session ? hash(extra.session).slice(0, 16) : '' });
}
