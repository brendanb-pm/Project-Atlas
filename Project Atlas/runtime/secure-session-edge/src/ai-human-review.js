import { createHash, randomUUID } from 'node:crypto';
import { errors } from './errors.js';

export const REVIEW_DISPOSITIONS = Object.freeze(['PENDING', 'ACCEPTED', 'EDITED_ACCEPTED', 'REJECTED']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PILOT_FIELDS = new Set(['Condition', 'NominalDiameter', 'ActualMeasuredDiameter']);

function hash(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function canonical(value, prefix) { const result = String(value || ''); if (!result.startsWith(prefix) || !CANONICAL.test(result.slice(prefix.length))) throw errors.invalidInput(); return result; }
function bounded(value, maximum, required = false) { const result = String(value ?? '').trim(); if ((required && !result) || result.length > maximum) throw errors.invalidInput(); return result || null; }
function scope(context, capability) {
  if (!context?.authoritative || !ID.test(context.tenantId || '') || String(context.tenantId).startsWith('PLATFORM_') || !ID.test(context.userId || '') || !(context.capabilities || []).includes(capability)) throw errors.forbidden();
  return Object.freeze({ tenantId: String(context.tenantId), userId: String(context.userId), correlationId: bounded(context.correlationId || `AI-REVIEW-${context.userId}`, 128, true) });
}
function normalizeReviewedValue(field, value) {
  if (field === 'Condition') {
    const result = String(value || '');
    if (!['NEW', 'USED', 'REGROUND', 'MODIFIED', 'DAMAGED', 'QUARANTINED', 'RETIRED'].includes(result)) throw errors.invalidInput();
    return result;
  }
  if (field === 'NominalDiameter' || field === 'ActualMeasuredDiameter') {
    const result = Number(value);
    if (!Number.isFinite(result) || result <= 0 || result > 100) throw errors.invalidInput();
    return result;
  }
  throw errors.invalidInput();
}

export class AiHumanReviewService {
  constructor({ repository, toolingService, clock = () => new Date(), uuid = randomUUID } = {}) {
    if (!repository || !toolingService) throw new Error('AI review repository and canonical tooling service are required.');
    this.repository = repository;
    this.toolingService = toolingService;
    this.clock = clock;
    this.uuid = uuid;
  }

  async begin(context, input) {
    const s = scope(context, 'AI_PROCESS_READ');
    const processingJobId = canonical(input.processingJobId, 'AI-JOB-');
    const keyHash = hash(bounded(input.idempotencyKey, 256, true));
    const existing = await this.repository.findByIdempotency(s, keyHash);
    if (existing) {
      if (existing.processing_job_id !== processingJobId) throw errors.persistenceConflict();
      return this.repository.get(s, existing.review_session_id);
    }
    const source = await this.repository.getReviewSource(s, processingJobId);
    if (source.job.status !== 'COMPLETED' || !source.job.result_id || source.job.context_parent_type !== 'TOOL_INSTANCE' || !['CURRENT', 'STATIC_TEXT'].includes(source.sourceState)) throw errors.persistenceConflict();
    const now = this.clock().toISOString();
    return this.repository.create(s, {
      reviewSessionId: `AI-REVIEW-${this.uuid()}`,
      processingJobId,
      toolInstanceId: source.job.context_parent_id,
      baseAuthoritativeVersion: Number(source.tool.version),
      sourceState: source.sourceState,
      idempotencyKeyHash: keyHash,
      initiatedAt: now,
      eventId: `AI-REVIEW-EVT-${this.uuid()}`,
      proposals: source.proposals.filter((proposal) => PILOT_FIELDS.has(proposal.field_key)).map((proposal) => ({ proposalId: proposal.proposal_id, processingJobId, fieldKey: proposal.field_key, fieldReviewId: `AI-FIELD-REVIEW-${this.uuid()}` }))
    });
  }

  async decide(context, input) {
    const s = scope(context, 'AI_PROCESS_READ');
    const disposition = String(input.disposition || '');
    if (!REVIEW_DISPOSITIONS.includes(disposition)) throw errors.invalidInput();
    const current = await this.repository.getFieldForDecision(s, canonical(input.reviewSessionId, 'AI-REVIEW-'), canonical(input.fieldReviewId, 'AI-FIELD-REVIEW-'));
    if (current.session_status !== 'DRAFT' || Number(input.expectedVersion) !== Number(current.review_version)) throw errors.persistenceConflict();
    let reviewedValue = null;
    if (disposition === 'ACCEPTED') {
      if (current.proposal_state !== 'EXTRACTED' || current.validation_state !== 'VALID') throw errors.invalidInput();
      reviewedValue = current.normalized_value_json;
    } else if (disposition === 'EDITED_ACCEPTED') {
      reviewedValue = normalizeReviewedValue(current.field_key, input.reviewedValue);
    }
    return this.repository.decide(s, {
      reviewSessionId: current.review_session_id,
      fieldReviewId: current.field_review_id,
      disposition,
      reviewedValue,
      expectedVersion: Number(input.expectedVersion),
      reviewedAt: this.clock().toISOString(),
      eventId: `AI-REVIEW-EVT-${this.uuid()}`
    });
  }

  get(context, reviewSessionId) { return this.repository.get(scope(context, 'AI_PROCESS_READ'), canonical(reviewSessionId, 'AI-REVIEW-')); }

  async commitTooling(context, input) {
    scope(context, 'AI_PROCESS_READ');
    return this.toolingService.applyHumanReviewedAiAssist(context, {
      reviewSessionId: canonical(input.reviewSessionId, 'AI-REVIEW-'),
      expectedReviewVersion: Number(input.expectedReviewVersion),
      expectedToolVersion: Number(input.expectedToolVersion),
      commitIdempotencyKeyHash: hash(bounded(input.idempotencyKey, 256, true)),
      measurementId: input.measurementId ? canonical(input.measurementId, 'TOOL-MEAS-') : `TOOL-MEAS-${this.uuid()}`,
      conditionEventId: input.conditionEventId ? canonical(input.conditionEventId, 'TOOL-COND-') : `TOOL-COND-${this.uuid()}`,
      manualEventId: `MANUAL-EVT-${this.uuid()}`,
      reviewEventId: `AI-REVIEW-EVT-${this.uuid()}`,
      committedAt: this.clock().toISOString()
    });
  }
}

export class PostgresAiHumanReviewRepository {
  constructor({ runtime, executor = null } = {}) { if (!runtime?.query || !runtime?.withTransaction) throw new Error('PostgreSQL AI review repository configuration is unavailable.'); this.runtime = runtime; this.executor = executor; }
  query(sql, values, operation) { return this.executor ? this.executor.query(sql, values, operation) : this.runtime.query(sql, values, operation); }
  transaction(work) { if (this.executor) return work(this); return this.runtime.withTransaction('AI_REVIEW_MUTATION', (tx) => work(new PostgresAiHumanReviewRepository({ runtime: this.runtime, executor: tx }))); }
  async findByIdempotency(s, key) { return (await this.query('SELECT review_session_id,processing_job_id FROM atlas_ai_review_sessions WHERE tenant_id=$1 AND idempotency_key_hash=$2 LIMIT 1', [s.tenantId, key], 'AI_REVIEW_IDEMPOTENCY')).rows[0] || null; }
  async getReviewSource(s, processingJobId) {
    const job = (await this.query("SELECT j.*,t.version AS tool_version,t.condition,tt.nominal_diameter,tt.unit_system FROM atlas_ai_processing_jobs j JOIN atlas_tool_instances t ON t.tenant_id=j.tenant_id AND t.tool_instance_id=j.context_parent_id JOIN atlas_tool_types tt ON tt.tenant_id=t.tenant_id AND tt.tool_type_id=t.tool_type_id WHERE j.tenant_id=$1 AND j.processing_job_id=$2 AND j.context_parent_type='TOOL_INSTANCE' AND t.status='ACTIVE' LIMIT 1", [s.tenantId, processingJobId], 'AI_REVIEW_SOURCE')).rows[0];
    if (!job) throw errors.notFound();
    const proposals = (await this.query('SELECT proposal_id,processing_job_id,field_key,normalized_value_json,proposal_state,validation_state FROM atlas_ai_field_proposals WHERE tenant_id=$1 AND processing_job_id=$2 ORDER BY field_key,proposal_id LIMIT 100', [s.tenantId, processingJobId], 'AI_REVIEW_PROPOSALS')).rows;
    let sourceState = job.attachment_id ? 'UNAVAILABLE' : 'STATIC_TEXT';
    if (job.attachment_id) {
      const attachment = (await this.query('SELECT version,checksum_sha256,upload_status,archived_at FROM atlas_contextual_attachments WHERE tenant_id=$1 AND attachment_id=$2 LIMIT 1', [s.tenantId, job.attachment_id], 'AI_REVIEW_ATTACHMENT_STATE')).rows[0];
      sourceState = !attachment ? 'UNAVAILABLE' : attachment.archived_at || attachment.upload_status === 'ARCHIVED' ? 'ARCHIVED' : Number(attachment.version) !== Number(job.attachment_version) || attachment.checksum_sha256 !== job.attachment_checksum_sha256 ? 'CHANGED' : 'CURRENT';
    }
    return { job, tool: { version: job.tool_version }, proposals, sourceState };
  }
  async create(s, x) {
    return this.transaction(async (repo) => {
      await repo.query("INSERT INTO atlas_ai_review_sessions(tenant_id,review_session_id,processing_job_id,context_parent_type,context_parent_id,tool_instance_id,status,base_authoritative_version,source_state_at_open,initiated_by_user_id,initiated_at,idempotency_key_hash) VALUES($1,$2,$3,'TOOL_INSTANCE',$4,$4,'DRAFT',$5,$6,$7,$8,$9)", [s.tenantId, x.reviewSessionId, x.processingJobId, x.toolInstanceId, x.baseAuthoritativeVersion, x.sourceState, s.userId, x.initiatedAt, x.idempotencyKeyHash], 'AI_REVIEW_CREATE');
      for (const proposal of x.proposals) await repo.query("INSERT INTO atlas_ai_field_reviews(tenant_id,field_review_id,review_session_id,proposal_id,processing_job_id,field_key,disposition) VALUES($1,$2,$3,$4,$5,$6,'PENDING')", [s.tenantId, proposal.fieldReviewId, x.reviewSessionId, proposal.proposalId, proposal.processingJobId, proposal.fieldKey], 'AI_FIELD_REVIEW_CREATE');
      await repo.event(s, x.reviewSessionId, null, x.eventId, 'SESSION_CREATED', x.initiatedAt, { processingJobId: x.processingJobId, proposalCount: x.proposals.length });
      return repo.get(s, x.reviewSessionId);
    });
  }
  async getFieldForDecision(s, reviewSessionId, fieldReviewId) {
    const row = (await this.query('SELECT r.review_session_id,r.status AS session_status,f.field_review_id,f.field_key,f.version AS review_version,p.proposal_state,p.validation_state,p.normalized_value_json FROM atlas_ai_review_sessions r JOIN atlas_ai_field_reviews f ON f.tenant_id=r.tenant_id AND f.review_session_id=r.review_session_id JOIN atlas_ai_field_proposals p ON p.tenant_id=f.tenant_id AND p.proposal_id=f.proposal_id AND p.processing_job_id=f.processing_job_id WHERE r.tenant_id=$1 AND r.review_session_id=$2 AND f.field_review_id=$3 LIMIT 1', [s.tenantId, reviewSessionId, fieldReviewId], 'AI_FIELD_REVIEW_GET')).rows[0];
    if (!row) throw errors.notFound();
    return row;
  }
  async decide(s, x) {
    return this.transaction(async (repo) => {
      const reviewed = x.disposition === 'PENDING' ? null : s.userId;
      const reviewedAt = x.disposition === 'PENDING' ? null : x.reviewedAt;
      const row = (await repo.query('UPDATE atlas_ai_field_reviews SET disposition=$4,reviewed_value_json=$5::jsonb,reviewed_by_user_id=$6,reviewed_at=$7,version=version+1 WHERE tenant_id=$1 AND review_session_id=$2 AND field_review_id=$3 AND version=$8 RETURNING *', [s.tenantId, x.reviewSessionId, x.fieldReviewId, x.disposition, x.reviewedValue === null ? null : JSON.stringify(x.reviewedValue), reviewed, reviewedAt, x.expectedVersion], 'AI_FIELD_REVIEW_DECIDE')).rows[0];
      if (!row) throw errors.persistenceConflict();
      await repo.query("UPDATE atlas_ai_review_sessions SET version=version+1 WHERE tenant_id=$1 AND review_session_id=$2 AND status='DRAFT'", [s.tenantId, x.reviewSessionId], 'AI_REVIEW_TOUCH');
      const event = x.disposition === 'PENDING' ? 'FIELD_RESET' : x.disposition === 'ACCEPTED' ? 'FIELD_ACCEPTED' : x.disposition === 'EDITED_ACCEPTED' ? 'FIELD_EDITED_ACCEPTED' : 'FIELD_REJECTED';
      await repo.event(s, x.reviewSessionId, x.fieldReviewId, x.eventId, event, x.reviewedAt, { fieldKey: row.field_key, disposition: x.disposition });
      return repo.get(s, x.reviewSessionId);
    });
  }
  async event(s, reviewSessionId, fieldReviewId, eventId, eventType, occurredAt, details) { await this.query('INSERT INTO atlas_ai_review_events(tenant_id,review_event_id,review_session_id,field_review_id,event_type,occurred_at,actor_user_id,correlation_id,details_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [s.tenantId, eventId, reviewSessionId, fieldReviewId, eventType, occurredAt, s.userId, s.correlationId, JSON.stringify(details)], 'AI_REVIEW_EVENT'); }
  async get(s, reviewSessionId) {
    const session = (await this.query('SELECT r.*,j.status AS processing_status,j.attachment_id,j.attachment_version,j.attachment_checksum_sha256 FROM atlas_ai_review_sessions r JOIN atlas_ai_processing_jobs j ON j.tenant_id=r.tenant_id AND j.processing_job_id=r.processing_job_id WHERE r.tenant_id=$1 AND r.review_session_id=$2 LIMIT 1', [s.tenantId, reviewSessionId], 'AI_REVIEW_GET')).rows[0];
    if (!session) throw errors.notFound();
    const fields = (await this.query('SELECT f.*,p.proposed_value_json,p.normalized_value_json,p.unit,p.proposal_state,p.confidence_label,p.validation_state,p.evidence_type,p.evidence_reference,p.evidence_excerpt,p.created_at AS proposal_created_at FROM atlas_ai_field_reviews f JOIN atlas_ai_field_proposals p ON p.tenant_id=f.tenant_id AND p.proposal_id=f.proposal_id AND p.processing_job_id=f.processing_job_id WHERE f.tenant_id=$1 AND f.review_session_id=$2 ORDER BY f.field_key,f.field_review_id LIMIT 100', [s.tenantId, reviewSessionId], 'AI_REVIEW_FIELDS')).rows;
    const authoritative = (await this.query('SELECT t.version,t.condition,t.current_measurement_id,tt.nominal_diameter,tt.unit_system,m.measured_diameter FROM atlas_tool_instances t JOIN atlas_tool_types tt ON tt.tenant_id=t.tenant_id AND tt.tool_type_id=t.tool_type_id LEFT JOIN atlas_tool_measurements m ON m.tenant_id=t.tenant_id AND m.tool_instance_id=t.tool_instance_id AND m.tool_measurement_id=t.current_measurement_id WHERE t.tenant_id=$1 AND t.tool_instance_id=$2 LIMIT 1', [s.tenantId, session.tool_instance_id], 'AI_REVIEW_AUTHORITY')).rows[0];
    if (!authoritative) throw errors.notFound();
    let sourceState = session.attachment_id ? 'UNAVAILABLE' : 'STATIC_TEXT';
    if (session.attachment_id) {
      const attachment = (await this.query('SELECT version,checksum_sha256,upload_status,archived_at FROM atlas_contextual_attachments WHERE tenant_id=$1 AND attachment_id=$2 LIMIT 1', [s.tenantId, session.attachment_id], 'AI_REVIEW_CURRENT_SOURCE')).rows[0];
      sourceState = !attachment ? 'UNAVAILABLE' : attachment.archived_at || attachment.upload_status === 'ARCHIVED' ? 'ARCHIVED' : Number(attachment.version) !== Number(session.attachment_version) || attachment.checksum_sha256 !== session.attachment_checksum_sha256 ? 'CHANGED' : 'CURRENT';
    }
    const staleReasons = [];
    if (session.processing_status !== 'COMPLETED') staleReasons.push('PROCESSING_RESULT_SUPERSEDED');
    if (!['CURRENT', 'STATIC_TEXT'].includes(sourceState)) staleReasons.push(`SOURCE_${sourceState}`);
    if (Number(authoritative.version) !== Number(session.base_authoritative_version)) staleReasons.push('AUTHORITATIVE_RECORD_CHANGED');
    const currentValues = { Condition: authoritative.condition, NominalDiameter: authoritative.nominal_diameter, ActualMeasuredDiameter: authoritative.measured_diameter };
    return { session, fields: fields.map((field) => ({ ...field, current_value: currentValues[field.field_key] ?? null })), authoritative, sourceState, staleReasons };
  }
}
