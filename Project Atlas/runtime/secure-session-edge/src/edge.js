import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { EdgeError, errors, safeError } from './errors.js';
import { cookie, correlationId, hash, parseCookies, randomOpaque, safeRoute, securityHeaders, validOpaque } from './security.js';
import { PreproductionAuthAttemptStore, PreproductionMemorySessionStore, ProductionSessionStoreUnavailable, SessionService } from './store.js';
import { PostgresWorkOrderRepository, WorkOrderService } from './work-orders.js';
import { rateLimitError, ToolingRateLimiter } from './tooling-rate-limit.js';

const SESSION_COOKIE = 'atlas_session';
const FLOW_COOKIE = 'atlas_auth_flow';
const MAX_BODY = 8192;
const workOrderPage = readFileSync(new URL('./work-order.html', import.meta.url));
const workOrderClient = readFileSync(new URL('./work-order-client.js', import.meta.url));
const workOrderStyles = readFileSync(new URL('./work-order.css', import.meta.url));

export function createEdgeConfig(input = {}) {
  const environment = input.environment || 'preproduction';
  const production = environment === 'production';
  if (!['development', 'test', 'preproduction', 'production'].includes(environment) || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(input.origin || '')) throw new Error('Secure-session edge configuration is invalid.');
  if (production && input.preproductionTestHarness) throw new Error('Preproduction test routes cannot be enabled in production.');
  if (production && input.sessionStoreKind !== 'postgresql') throw new Error('Production requires a PostgreSQL-backed session store.');
  const policy = input.policy || {};
  for (const value of [policy.idleSeconds ?? 1800, policy.absoluteSeconds ?? 28800, policy.attemptSeconds ?? 300]) if (!Number.isInteger(value) || value < 60 || value > 86400) throw new Error('Secure-session timing policy is invalid.');
  return Object.freeze({ environment, production, origin: input.origin, allowedRoutes: Object.freeze(input.allowedRoutes || ['home']), providers: input.providers || {}, preproductionTestHarness: input.preproductionTestHarness === true, sessionStoreKind: input.sessionStoreKind || (production ? 'postgresql' : 'memory'), policy: Object.freeze({ idleSeconds: policy.idleSeconds ?? 1800, absoluteSeconds: policy.absoluteSeconds ?? 28800, attemptSeconds: policy.attemptSeconds ?? 300 }), rateLimit: Object.freeze(input.rateLimit || { windowMs: 60000, max: 30 }) });
}

export class MemoryAuditSink {
  constructor() { this.events = []; }
  async write(event) { this.events.push(Object.freeze({ ...event })); }
}

export class SlidingRateLimiter {
  constructor({ clock = () => new Date(), policy, scope = 'peer' } = {}) { this.clock = clock; this.policy = policy; this.scope = scope; this.events = new Map(); }
  consume(key) {
    if (!this.policy || !Number.isInteger(this.policy.max) || this.policy.max < 1 || !Number.isInteger(this.policy.windowMs) || this.policy.windowMs < 1000) throw errors.providerUnavailable();
    const now = this.clock().getTime(), threshold = now - this.policy.windowMs, items = (this.events.get(key) || []).filter((value) => value > threshold);
    if (items.length >= this.policy.max) throw rateLimitError(this.scope, this.policy.max, items[0] - threshold);
    if (!this.events.has(key) && this.events.size >= 4096) {
      for (const [name, events] of this.events) if (events.at(-1) <= threshold) this.events.delete(name);
      if (this.events.size >= 4096) throw rateLimitError('peer-capacity', 4096, this.policy.windowMs);
    }
    items.push(now); this.events.set(key, items);
  }
}

export function createTenantEdge({ config: rawConfig, providers, authority, sessionStore, attemptStore, protectedApi = null, readiness = null, workOrderRuntime, audit = new MemoryAuditSink(), clock = () => new Date(), limiter, onThrottle } = {}) {
  const config = createEdgeConfig(rawConfig);
  if (!authority || !providers) throw new Error('Secure-session edge dependencies are required.');
  if (config.production && Object.values(providers).some((provider) => provider?.isTestAdapter === true)) throw new Error('Test providers cannot be selected in production.');
  if (config.production && !sessionStore?.isDurablePostgresStore) throw new Error('Production requires a PostgreSQL-backed session store.');
  if (config.production && attemptStore instanceof PreproductionAuthAttemptStore) throw new Error('Preproduction auth-attempt storage cannot be selected in production.');
  const actualSessionStore = sessionStore || (config.production ? new ProductionSessionStoreUnavailable() : new PreproductionMemorySessionStore({ clock }));
  const actualAttemptStore = attemptStore || new PreproductionAuthAttemptStore({ clock, enabled: !config.production || config.sessionStoreKind === 'postgresql' });
  const sessions = new SessionService({ store: actualSessionStore, clock, policy: config.policy });
  const rateLimiter = limiter || new SlidingRateLimiter({ clock, policy: config.rateLimit });
  if (workOrderRuntime && (workOrderRuntime.config?.role !== 'APPLICATION' || !sessionStore?.isDurablePostgresStore)) {
    throw new Error('Work orders require the PostgreSQL application runtime and durable sessions.');
  }
  const workOrders = workOrderRuntime && new WorkOrderService({
    repository: new PostgresWorkOrderRepository({ runtime: workOrderRuntime })
  });
  const dependencies = { config, providers, authority, sessions, attempts: actualAttemptStore, protectedApi, readiness, audit, clock, rateLimiter };
  return { ...dependencies, handler: createHandler({ ...dependencies, workOrders, onThrottle,
    toolingLimiter: new ToolingRateLimiter({ clock }),
    toolingLookupLimiter: new SlidingRateLimiter({ clock, policy: { windowMs: 60000, max: 600 }, scope: 'authentication-peer' }),
    toolingChecks: 0 }) };
}

// Compatibility name retained for 1B tests and explicitly preproduction callers.
export const createPreproductionEdge = createTenantEdge;

export function createHttpServer(edge) { return createServer(edge.handler); }

function createHandler(deps) {
  return async (request, response) => {
    const requestId = correlationId(), url = new URL(request.url, deps.config.origin), route = `${request.method} ${url.pathname}`;
    try {
      setHeaders(response, deps.config); if (request.method === 'OPTIONS') throw errors.notFound();
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
      if (request.method === 'GET' && url.pathname === '/ready') return await ready(response, deps);
      if (request.method === 'GET' && url.pathname === '/auth/providers') return sendJson(response, 200, { providers: Object.values(deps.config.providers).filter((item) => item.enabled).map((item) => ({ id: item.id, label: item.id === 'MICROSOFT' ? 'Continue with Microsoft' : 'Continue with Google' })) });
      if (request.method === 'POST' && url.pathname === '/auth/start') return await begin(request, response, deps, requestId);
      if (request.method === 'GET' && url.pathname === '/auth/callback') return await callback(request, response, deps, url, requestId);
      if (request.method === 'GET' && url.pathname === '/session/status') return await status(request, response, deps, requestId);
      if (request.method === 'POST' && url.pathname === '/auth/tenant-select') return await selectTenant(request, response, deps, requestId);
      if (request.method === 'POST' && url.pathname === '/auth/logout') return await logout(request, response, deps, requestId);
      if (request.method === 'GET' && url.pathname === '/preproduction/context') return await contextHarness(request, response, deps, requestId);
      if (deps.workOrders && (url.pathname === '/api/work-orders' || url.pathname.startsWith('/api/work-orders/') ||
          url.pathname === '/work-orders' || url.pathname === '/work-order-client.js' || url.pathname === '/work-order.css')) {
        return await workOrderRequest(request, response, deps, url, requestId);
      }
      if (url.pathname.startsWith('/api/')) return await protectedRequest(request, response, deps, url, requestId);
      throw errors.notFound();
    } catch (error) {
      const safe = safeError(error);
      if (safe.throttle) {
        response.setHeader('Retry-After', safe.throttle.retryAfter);
        try {
          deps.onThrottle?.({ operation: 'EDGE_RATE_LIMIT', status: 429,
            category: url.pathname.startsWith('/api/tooling/') ? request.method === 'GET' ? 'tooling-read' : 'tooling-write' : 'other',
            reason: safe.code, ...safe.throttle });
        } catch { /* Diagnostic failure cannot change admission. */ }
      } else await audit(deps, requestId, 'REQUEST_FAILURE', safe.code, { route });
      if (safe.code === 'SESSION_EXPIRED' || safe.code === 'SESSION_REVOKED') clearSession(response, deps.config);
      return sendJson(response, safe.status, { state: stateFor(safe.code), message: safe.message, correlationId: requestId });
    }
  };
}

async function workOrderRequest(request, response, deps, url, requestId) {
  const match = /^\/api\/work-orders\/([A-Za-z0-9][A-Za-z0-9._:-]{0,159})(?:\/(history|approve|complete|operations\/([A-Za-z0-9][A-Za-z0-9._:-]{0,159})\/complete))?$/.exec(url.pathname);
  const file = request.method === 'GET' && {
    '/work-orders': [workOrderPage, 'text/html'],
    '/work-order-client.js': [workOrderClient, 'text/javascript'],
    '/work-order.css': [workOrderStyles, 'text/css']
  }[url.pathname];
  const queue = request.method === 'GET' && url.pathname === '/api/work-orders';
  const action = match?.[2];
  const read = request.method === 'GET' && match && (!action || action === 'history');
  const write = request.method === 'POST' && match && action && action !== 'history';
  if (!file && !queue && !read && !write) throw errors.notFound();
  const record = await resolveSession(request, deps);
  const capability = !write ? 'WORK_ORDER_READ' : action === 'approve' ? 'WORK_ORDER_APPROVE' : 'WORK_ORDER_OPERATE';
  const resolved = await authorize(deps, record, 'WORK_ORDER', capability);
  const context = { ...resolved, authoritative: true, correlationId: requestId };
  if (write) {
    requireOrigin(request, deps.config);
    await deps.sessions.validateCsrf(record, request.headers['x-atlas-csrf']);
  }
  await deps.sessions.touch(record);
  if (file) {
    response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
    return response.end(file[0]);
  }
  const service = deps.workOrders;
  let data;
  if (queue) data = await service.queue(context);
  else if (read && action === 'history') {
    const before = url.searchParams.get('before');
    data = await service.history(context, match[1], before === null ? null : Number(before));
  } else if (read) {
    data = await service.read(context, match[1]);
    data.capabilities = context.capabilities.filter((item) => item.startsWith('WORK_ORDER_'));
  } else {
    const body = await jsonBody(request);
    if (action === 'approve') data = await service.approve(context, match[1], body);
    else if (action === 'complete') data = await service.complete(context, match[1], body);
    else data = await service.completeOperation(context, match[1], match[3], body);
  }
  return sendJson(response, 200, { data, correlationId: requestId });
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
  const identity = await deps.authority.resolveIdentity(principal.provider, principal.issuer, principal.subject);
  const user = identity && await deps.authority.resolveUser(identity.userId);
  if (!identity || !user || user.status !== 'ACTIVE') { await audit(deps, requestId, 'LOGIN_FAILURE', 'IDENTITY_NOT_PROVISIONED', { provider: attempt.provider }); return sendJson(response, 403, { state: 'ACCESS_UNAVAILABLE', message: 'Access is unavailable.', correlationId: requestId }); }
  let permitted;
  try { permitted = await deps.authority.permittedTenants(user.id); } catch { throw errors.entitlementUnavailable(); }
  if (!permitted.length) { await audit(deps, requestId, 'LOGIN_FAILURE', 'NO_PERMITTED_TENANT', { provider: attempt.provider }); return sendJson(response, 403, { state: 'ACCESS_UNAVAILABLE', message: 'Access is unavailable.', correlationId: requestId }); }
  const activeTenant = permitted.length === 1 ? permitted[0] : '';
  const created = await deps.sessions.create({ userId: user.id, provider: principal.provider, issuer: principal.issuer, subject: principal.subject, permittedTenants: permitted, activeTenant, authenticatedAt: principal.authenticatedAt, authenticationContext: principal.authenticationContext });
  response.setHeader('Set-Cookie', [cookie(SESSION_COOKIE, created.opaque, { secure: deps.config.production, maxAge: deps.config.policy.absoluteSeconds }), cookie(FLOW_COOKIE, '', { secure: deps.config.production, path: '/auth/callback', maxAge: 0 })]);
  await audit(deps, requestId, 'LOGIN_SUCCESS', 'SESSION_CREATED', { provider: principal.provider, session: created.record.id });
  return sendJson(response, 200, { state: activeTenant ? 'SIGNED_IN' : 'TENANT_SELECTION_REQUIRED', returnRoute: attempt.route, csrfToken: created.csrf, correlationId: requestId });
}

async function status(request, response, deps, requestId) {
  const record = await resolveSession(request, deps); const context = await authorize(deps, record, 'SESSION_STATUS', 'CORE_RECORD_READ'); await deps.sessions.touch(record);
  const csrf = await deps.sessions.rotateCsrf(record); await audit(deps, requestId, 'SESSION_STATUS', 'AUTHORIZED', { session: record.id });
  return sendJson(response, 200, { state: 'AUTHENTICATED', activeTenant: context.tenantId, csrfToken: csrf, correlationId: requestId });
}

async function selectTenant(request, response, deps, requestId) {
  requireOrigin(request, deps.config); const record = await resolveSession(request, deps, true), body = await jsonBody(request); await deps.sessions.validateCsrf(record, request.headers['x-atlas-csrf']);
  const tenantId = String(body.tenantId || ''); if (!validTenant(tenantId) || !record.permittedTenants.includes(tenantId)) { await audit(deps, requestId, 'TENANT_SWITCH_REJECTED', 'FORBIDDEN_TENANT', { session: record.id }); throw errors.forbidden(); }
  try { await authorize(deps, { ...record, activeTenant: tenantId }, 'TENANT_SWITCH', 'CORE_RECORD_READ'); } catch (error) { await audit(deps, requestId, 'TENANT_SWITCH_REJECTED', error.code || 'ACCESS_UNAVAILABLE', { session: record.id }); throw error; }
  const rotated = await deps.sessions.rotate(record, tenantId); response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, rotated.opaque, { secure: deps.config.production, maxAge: deps.config.policy.absoluteSeconds }));
  await audit(deps, requestId, 'TENANT_SWITCHED', 'ROTATED', { session: rotated.record.id }); return sendJson(response, 200, { state: 'AUTHENTICATED', activeTenant: tenantId, csrfToken: rotated.csrf, correlationId: requestId });
}

async function logout(request, response, deps, requestId) {
  requireOrigin(request, deps.config); const record = await resolveSession(request, deps, true); await deps.sessions.validateCsrf(record, request.headers['x-atlas-csrf']); await deps.sessions.revoke(record, 'LOGOUT'); clearSession(response, deps.config);
  await audit(deps, requestId, 'LOGOUT', 'REVOKED', { session: record.id }); return sendJson(response, 200, { state: 'SIGNED_OUT', correlationId: requestId });
}

async function contextHarness(request, response, deps, requestId) {
  if (!deps.config.preproductionTestHarness || deps.config.production) throw errors.notFound();
  const record = await resolveSession(request, deps), context = await authorize(deps, record, 'PREPRODUCTION_CONTEXT', 'CORE_RECORD_READ'); await deps.sessions.touch(record);
  return sendJson(response, 200, { state: 'AUTHORIZED', activeTenant: context.tenantId, authenticatedUser: context.userId, correlationId: requestId });
}

async function protectedRequest(request, response, deps, url, requestId) {
  if (!deps.protectedApi?.match) throw errors.notFound();
  const descriptor = deps.protectedApi.match(request.method, url);
  if (!descriptor) throw errors.notFound();
  const tooling = url.pathname.startsWith('/api/tooling/');
  if (!tooling) deps.rateLimiter.consume(`api:${remoteKey(request)}`);
  const record = tooling ? await resolveToolingSession(request, deps) : await resolveSession(request, deps);
  const release = tooling ? deps.toolingLimiter.acquire({ tenantId: record.activeTenant, userId: record.userId }, descriptor) : () => {};
  try {
    if (descriptor.mutation) {
      requireOrigin(request, deps.config);
      await deps.sessions.validateCsrf(record, request.headers['x-atlas-csrf']);
    }
    const scope = await authorize(deps, record, descriptor.operation, descriptor.capability);
    const context = Object.freeze({ ...scope, correlationId: requestId, authenticatedAt: record.authenticatedAt, sessionReference: record.id });
    const input = descriptor.binary ? await binaryBody(request, descriptor.maxBytes) : descriptor.body === false ? {} : await jsonBody(request);
    const data = await descriptor.execute(context, input, url, request);
    await deps.sessions.touch(record);
    await audit(deps, requestId, descriptor.operation, 'AUTHORIZED', { session: record.id, tenantId: context.tenantId, actorUserId: context.userId });
    return sendJson(response, descriptor.status || 200, { state: 'LOADED', data, correlationId: requestId });
  } finally { release(); }
}

async function resolveToolingSession(request, deps) {
  const key = `tooling-anonymous:${remoteKey(request)}`;
  let opaque;
  try { opaque = parseCookies(request.headers.cookie)[SESSION_COOKIE]; } catch { /* Malformed cookies are anonymous. */ }
  if (!validOpaque(opaque)) {
    deps.rateLimiter.consume(key);
    throw errors.unauthenticated();
  }
  deps.toolingLookupLimiter.consume(remoteKey(request));
  if (deps.toolingChecks >= 64) throw rateLimitError('authorization-concurrency', 64, 1000);
  deps.toolingChecks++;
  try {
    return await deps.sessions.resolve(opaque);
  } catch (error) {
    if (error.status === 401) deps.rateLimiter.consume(key);
    throw error;
  } finally {
    deps.toolingChecks--;
  }
}

async function authorize(deps, record, operation, requiredCapability) {
  return deps.authority.authorize({ userId: record.userId, tenantId: record.activeTenant, operation, requiredCapability });
}
async function ready(response, deps) {
  if (!deps.readiness?.readiness) return sendJson(response, 503, { status: 'NOT_READY', reason: 'DEPENDENCY_UNAVAILABLE' });
  const result = await deps.readiness.readiness();
  return sendJson(response, result.status === 'READY' ? 200 : 503, result.status === 'READY' ? { status: 'READY' } : { status: 'NOT_READY', reason: 'DEPENDENCY_UNAVAILABLE' });
}
async function resolveSession(request, deps, allowPending = false) { return deps.sessions.resolve(parseCookies(request.headers.cookie)[SESSION_COOKIE] || '', { allowPending }); }
function requireOrigin(request, config) { const origin = request.headers.origin || request.headers.referer?.replace(/^(https:\/\/[^/]+).*$/, '$1'); if (origin !== config.origin) throw errors.csrf(); }
function validTenant(value) { return /^[A-Za-z0-9_-]{1,160}$/.test(value); }
function remoteKey(request) { return String(request.socket.remoteAddress || 'unknown').slice(0, 128); }
function clearSession(response, config) { response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { secure: config.production, maxAge: 0 })); }
function setHeaders(response, config) { for (const [key, value] of Object.entries(securityHeaders(config))) response.setHeader(key, value); }
function sendJson(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
function stateFor(code) { return ({ UNAUTHENTICATED: 'SIGNED_OUT', SESSION_EXPIRED: 'SESSION_EXPIRED', SESSION_REVOKED: 'SESSION_EXPIRED', INVALID_CSRF: 'AUTHENTICATION_FAILED', PROVIDER_UNAVAILABLE: 'PROVIDER_TEMPORARILY_UNAVAILABLE', ENTITLEMENT_UNAVAILABLE: 'ACCESS_UNAVAILABLE', PERSISTENCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE', SCHEMA_INCOMPATIBLE: 'ACCESS_UNAVAILABLE', FORBIDDEN: 'ACCESS_UNAVAILABLE', NOT_FOUND: 'UNSUPPORTED_ROUTE', CONFLICT: 'ACTIONABLE_ERROR', INVALID_REQUEST: 'ACTIONABLE_ERROR' }[code] || 'ACTIONABLE_ERROR'); }
async function jsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) throw errors.invalidInput(); chunks.push(chunk); }
  if (!chunks.length) return {}; try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; } catch { throw errors.invalidInput(); }
}
async function binaryBody(request, maximum = 50 * 1024 * 1024) {
  const length = Number(request.headers['content-length']);
  if (Number.isFinite(length) && (length < 0 || length > maximum)) throw errors.invalidInput();
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maximum) throw errors.invalidInput(); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function audit(deps, correlationId, operation, outcome, extra = {}) {
  try { await deps.audit.write({ occurredAt: deps.clock().toISOString(), correlationId, operation, outcome, provider: extra.provider || '', tenantId: extra.tenantId || null, actorUserId: extra.actorUserId || null, sessionReference: extra.session ? hash(extra.session).slice(0, 16) : '' }); } catch { /* audit dependency failure must not leak or replace the original safe response */ }
}
