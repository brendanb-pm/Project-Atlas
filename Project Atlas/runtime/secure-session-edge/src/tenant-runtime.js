import { randomUUID } from 'node:crypto';
import { createTenantEdge, createHttpServer } from './edge.js';
import { PostgresAtlasAuthority } from './authority.js';
import { PostgresAuthAttemptStore } from './store.js';
import { ToolingTraceabilityService, PostgresToolingRepository } from './tooling-traceability.js';
import { ContextualAttachmentService, PostgresContextualAttachmentRepository } from './contextual-attachments.js';
import { AiProcessingService, PostgresAiProcessingRepository } from './ai-processing.js';
import { AiHumanReviewService, PostgresAiHumanReviewRepository } from './ai-human-review.js';
import { ToolingProtectedApi } from './tooling-api.js';
import { createPostgresRuntimeConfig, PostgresRuntime } from './postgres-runtime.js';
import { PostgresSessionStore } from './postgres-session-store.js';
import { PostgresMigrationRunner, RuntimeReadiness } from './migrations.js';

export class PostgresSecurityAuditSink {
  constructor({ runtime, clock = () => new Date() } = {}) { if (!runtime?.query) throw new Error('PostgreSQL security audit configuration is unavailable.'); this.runtime = runtime; this.clock = clock; }
  async write(event) {
    const tenantId = event.tenantId || null;
    await this.runtime.query('INSERT INTO atlas_security_events(event_id,tenant_id,correlation_id,event_type,actor_user_id,occurred_at,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [`SEC-${randomUUID()}`, tenantId, event.correlationId, event.operation, event.actorUserId || null, event.occurredAt || this.clock().toISOString(), JSON.stringify({ outcome: event.outcome, provider: event.provider || '', sessionReference: event.sessionReference || '' })], 'SECURITY_AUDIT_APPEND');
  }
}

/** Production composition root. Every dependency is server/install controlled;
 * no browser value can select the tenant, provider, database, or capability set. */
export async function createAuthenticatedTenantRuntime({ edgeConfig, oidcProviders, database, secretProvider, entitlement, storage, aiProvider, PoolCtor, log, clock } = {}) {
  if (!edgeConfig || edgeConfig.environment !== 'production') throw new Error('Authenticated tenant runtime requires production configuration.');
  if (!storage || storage.provider === 'TEST' || !aiProvider || aiProvider.isTestAdapter) throw new Error('Production attachment and AI providers must be server configured.');
  if (!database || database.provider !== 'POSTGRESQL') throw new Error('PostgreSQL provider selection is unavailable.');
  const application = database.application || {};
  const applicationConfig = await createPostgresRuntimeConfig({ ...database, ...application, user: application.user || database.applicationUser || database.user, passwordSecretRef: application.passwordSecretRef || database.applicationPasswordSecretRef || database.passwordSecretRef, role: 'APPLICATION' }, { secretProvider });
  const runtime = new PostgresRuntime(applicationConfig, { PoolCtor, log });
  const sessions = new PostgresSessionStore({ runtime, touchIntervalMs: applicationConfig.pool.touchIntervalMs });
  const migrations = new PostgresMigrationRunner({ runtime });
  const runtimeReadiness = new RuntimeReadiness({ runtime, migrations, sessionStore: sessions });
  const foundation = Object.freeze({ runtime, sessions, migrations, readiness: runtimeReadiness, async close() { await runtime.close(); } });
  const readiness = await foundation.readiness.readiness();
  if (readiness.status !== 'READY') { await foundation.close(); throw new Error('Tenant PostgreSQL runtime is not ready.'); }
  const authority = new PostgresAtlasAuthority({ runtime: foundation.runtime, entitlement });
  const attemptStore = new PostgresAuthAttemptStore({ runtime: foundation.runtime, clock });
  const toolingRepository = new PostgresToolingRepository({ runtime: foundation.runtime });
  const tooling = new ToolingTraceabilityService({ repository: toolingRepository, clock });
  const attachments = new ContextualAttachmentService({ repository: new PostgresContextualAttachmentRepository({ runtime: foundation.runtime }), storage, clock });
  const ai = new AiProcessingService({ repository: new PostgresAiProcessingRepository({ runtime: foundation.runtime }), storage, provider: aiProvider, clock });
  const reviews = new AiHumanReviewService({ repository: new PostgresAiHumanReviewRepository({ runtime: foundation.runtime }), toolingService: tooling, clock });
  const protectedApi = new ToolingProtectedApi({ tooling, attachments, ai, reviews });
  const audit = new PostgresSecurityAuditSink({ runtime: foundation.runtime, clock });
  const edge = createTenantEdge({ config: edgeConfig, providers: oidcProviders, authority,
    sessionStore: foundation.sessions, attemptStore, protectedApi, readiness: foundation.readiness,
    workOrderRuntime: foundation.runtime, audit, clock, onThrottle: log });
  return Object.freeze({ edge, foundation, services: Object.freeze({ tooling, attachments, ai, reviews }), createServer: () => createHttpServer(edge), async close() { await foundation.close(); } });
}
