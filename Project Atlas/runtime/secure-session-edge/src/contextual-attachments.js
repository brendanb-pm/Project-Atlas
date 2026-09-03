import { createHash, randomUUID } from 'node:crypto';
import { errors } from './errors.js';

export const ATTACHMENT_PARENT_TYPES = Object.freeze(['TOOL_INSTANCE', 'TOOL_ASSEMBLY', 'PURCHASE_REQUEST', 'JOB', 'JOB_OPERATION']);
export const ATTACHMENT_CATEGORIES = Object.freeze(['PHOTO', 'DRAWING', 'INSPECTION', 'RECEIPT', 'CERTIFICATE', 'GENERAL']);
const PROVIDERS = new Set(['S3', 'AZURE_BLOB', 'TEST']);
const SAFE_MEDIA = /^(image\/(jpeg|png|webp|heic)|application\/pdf|text\/plain|text\/csv|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)))$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_LIMIT = 100;

function text(value, max, required = false) { const result = String(value ?? '').trim(); if ((required && !result) || result.length > max) throw errors.invalidInput(); return result || null; }
function integer(value, min, max) { const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw errors.invalidInput(); return result; }
function canonical(value, prefix) { const result = String(value || ''); if (!result.startsWith(prefix) || !CANONICAL.test(result.slice(prefix.length))) throw errors.invalidInput(); return result; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function scope(context, capability) {
  if (!context?.authoritative || !ID.test(context.tenantId || '') || String(context.tenantId).startsWith('PLATFORM_') || !ID.test(context.userId || '') || !(context.capabilities || []).includes(capability)) throw errors.forbidden();
  return Object.freeze({ tenantId: String(context.tenantId), userId: String(context.userId), correlationId: text(context.correlationId || `ATTACHMENT-${context.userId}`, 128, true) });
}
function parent(input) {
  if (!ATTACHMENT_PARENT_TYPES.includes(input.parentType) || !ID.test(input.parentId || '')) throw errors.invalidInput();
  return { parentType: input.parentType, parentId: String(input.parentId) };
}
function bodyBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw errors.invalidInput();
}
function storageReference(tenantId, attachmentId) { return `${hash(tenantId).slice(0, 20)}/${attachmentId}`; }

/** Provider-neutral object storage contract. Implementations never return public URLs or credentials. */
export class ObjectStorageRouter {
  constructor({ provider, adapters } = {}) { if (!PROVIDERS.has(provider) || !adapters?.[provider]) throw new Error('Configured object storage provider is unavailable.'); this.provider = provider; this.adapter = adapters[provider]; }
  async put(input) { await this.adapter.put(input); return { provider: this.provider, storageReference: input.storageReference }; }
  async get(input) { if (!this.adapter.get) throw errors.persistenceUnavailable(); return this.adapter.get(input); }
  async remove(input) { return this.adapter.remove(input); }
}

export class S3ObjectStorageAdapter {
  constructor({ gateway, bucket } = {}) { if (!gateway?.putObject || !gateway?.deleteObject || !bucket) throw new Error('S3 object storage configuration is unavailable.'); this.gateway = gateway; this.bucket = bucket; }
  put({ storageReference, body, mediaType, checksumSha256 }) { return this.gateway.putObject({ bucket: this.bucket, key: storageReference, body, contentType: mediaType, checksumSha256 }); }
  get({ storageReference }) { if (!this.gateway.getObject) throw new Error('S3 object read is unavailable.'); return this.gateway.getObject({ bucket: this.bucket, key: storageReference }); }
  remove({ storageReference }) { return this.gateway.deleteObject({ bucket: this.bucket, key: storageReference }); }
}

export class AzureBlobObjectStorageAdapter {
  constructor({ gateway, container } = {}) { if (!gateway?.upload || !gateway?.delete || !container) throw new Error('Azure Blob storage configuration is unavailable.'); this.gateway = gateway; this.container = container; }
  put({ storageReference, body, mediaType, checksumSha256 }) { return this.gateway.upload({ container: this.container, blobName: storageReference, body, contentType: mediaType, checksumSha256 }); }
  get({ storageReference }) { if (!this.gateway.download) throw new Error('Azure Blob read is unavailable.'); return this.gateway.download({ container: this.container, blobName: storageReference }); }
  remove({ storageReference }) { return this.gateway.delete({ container: this.container, blobName: storageReference }); }
}

export class InMemoryObjectStorageAdapter {
  constructor() { this.objects = new Map(); }
  async put({ storageReference, body, mediaType, checksumSha256 }) { const bytes = Buffer.from(body); if (hash(bytes) !== checksumSha256) throw new Error('Object checksum mismatch.'); this.objects.set(storageReference, { body: bytes, mediaType, checksumSha256 }); }
  async get({ storageReference }) { const value=this.objects.get(storageReference);if(!value)throw new Error('Object unavailable.');return { ...value, body: Buffer.from(value.body) }; }
  async remove({ storageReference }) { this.objects.delete(storageReference); }
}

export class ContextualAttachmentService {
  constructor({ repository, storage, clock = () => new Date(), uuid = randomUUID } = {}) { if (!repository || !storage) throw new Error('Attachment repository and object storage are required.'); this.repository = repository; this.storage = storage; this.clock = clock; this.uuid = uuid; }

  async upload(context, input) {
    const s = scope(context, 'ATTACHMENT_WRITE');
    const p = parent(input);
    const fileName = text(input.fileName, 240, true);
    const mediaType = text(input.mediaType, 160, true)?.toLowerCase();
    if (!SAFE_MEDIA.test(mediaType)) throw errors.invalidInput();
    const body = bodyBuffer(input.body);
    const byteSize = integer(input.byteSize, 0, MAX_BYTES);
    if (body.byteLength !== byteSize) throw errors.invalidInput();
    const checksumSha256 = hash(body);
    if (!ATTACHMENT_CATEGORIES.includes(input.category || 'GENERAL')) throw errors.invalidInput();
    const idempotencyKey = text(input.idempotencyKey, 256, true);
    const idempotencyKeyHash = hash(idempotencyKey);
    const existing = await this.repository.findByIdempotencyKey(s, idempotencyKeyHash);
    if (existing && (existing.parent_type !== p.parentType || existing.parent_id !== p.parentId || existing.file_name !== fileName || existing.media_type !== mediaType || Number(existing.byte_size) !== byteSize || existing.checksum_sha256 !== checksumSha256)) throw errors.persistenceConflict();
    if (existing?.upload_status === 'AVAILABLE') return existing;
    const attachmentId = existing?.attachment_id || `ATTACH-${this.uuid()}`;
    const reference = existing?.storage_reference || storageReference(s.tenantId, attachmentId);
    const now = this.clock().toISOString();
    const pending = existing || await this.repository.begin(s, {
      attachmentId, ...p, fileName, mediaType, byteSize, checksumSha256,
      category: input.category || 'GENERAL', description: text(input.description, 1000),
      storageProvider: this.storage.provider, storageReference: reference,
      idempotencyKeyHash, eventId: `ATTACH-EVT-${this.uuid()}`, occurredAt: now
    });
    try {
      await this.storage.put({ storageReference: reference, body, mediaType, checksumSha256 });
      return await this.repository.complete(s, attachmentId, pending.version, { checksumSha256, byteSize, eventId: `ATTACH-EVT-${this.uuid()}`, occurredAt: this.clock().toISOString() });
    } catch {
      await this.repository.fail(s, attachmentId, pending.version, { failureCode: 'OBJECT_STORAGE_WRITE_FAILED', eventId: `ATTACH-EVT-${this.uuid()}`, occurredAt: this.clock().toISOString() });
      throw errors.persistenceUnavailable();
    }
  }

  list(context, input) { const s = scope(context, 'ATTACHMENT_READ'); const p = parent(input); const limit = integer(input.limit ?? 25, 1, MAX_LIMIT); const cursor = input.cursor ? text(input.cursor, 300, true) : null; return this.repository.list(s, { ...p, limit, cursor }); }
  updateMetadata(context, input) { const s = scope(context, 'ATTACHMENT_WRITE'); return this.repository.updateMetadata(s, canonical(input.attachmentId, 'ATTACH-'), integer(input.expectedVersion, 1, 2147483647), { category: ATTACHMENT_CATEGORIES.includes(input.category) ? input.category : (() => { throw errors.invalidInput(); })(), description: text(input.description, 1000), eventId: `ATTACH-EVT-${this.uuid()}`, occurredAt: this.clock().toISOString() }); }
  async archive(context, input) { const s = scope(context, 'ATTACHMENT_WRITE'); const attachmentId = canonical(input.attachmentId, 'ATTACH-'); const row = await this.repository.archive(s, attachmentId, integer(input.expectedVersion, 1, 2147483647), { eventId: `ATTACH-EVT-${this.uuid()}`, occurredAt: this.clock().toISOString() }); try { await this.storage.remove({ storageReference: row.storage_reference }); } catch { /* archived metadata remains authoritative; cleanup is retryable operational work */ } return row; }
}

const PARENT_COLUMNS = Object.freeze({ TOOL_INSTANCE: 'tool_instance_id', TOOL_ASSEMBLY: 'tool_assembly_id', PURCHASE_REQUEST: 'purchase_request_id', JOB: 'job_id', JOB_OPERATION: 'job_operation_id' });

export class PostgresContextualAttachmentRepository {
  constructor({ runtime, executor = null } = {}) { if (!runtime?.query || !runtime?.withTransaction) throw new Error('PostgreSQL attachment repository configuration is unavailable.'); this.runtime = runtime; this.executor = executor; }
  query(sql, values, operation) { return this.executor ? this.executor.query(sql, values, operation) : this.runtime.query(sql, values, operation); }
  transaction(work) { if (this.executor) return work(this); return this.runtime.withTransaction('ATTACHMENT_MUTATION', (tx) => work(new PostgresContextualAttachmentRepository({ runtime: this.runtime, executor: tx }))); }
  async findByIdempotencyKey(s, key) { return (await this.query('SELECT * FROM atlas_contextual_attachments WHERE tenant_id=$1 AND idempotency_key_hash=$2 LIMIT 1', [s.tenantId, key], 'ATTACHMENT_IDEMPOTENCY_LOOKUP')).rows[0] || null; }
  async begin(s, x) { return this.transaction(async (repo) => { const columns = { tool_instance_id: null, tool_assembly_id: null, purchase_request_id: null, job_id: null, job_operation_id: null }; columns[PARENT_COLUMNS[x.parentType]] = x.parentId; const r = await repo.query('INSERT INTO atlas_contextual_attachments(tenant_id,attachment_id,parent_type,parent_id,tool_instance_id,tool_assembly_id,purchase_request_id,job_id,job_operation_id,file_name,media_type,byte_size,checksum_sha256,category,description,storage_provider,storage_reference,idempotency_key_hash,uploaded_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *', [s.tenantId,x.attachmentId,x.parentType,x.parentId,columns.tool_instance_id,columns.tool_assembly_id,columns.purchase_request_id,columns.job_id,columns.job_operation_id,x.fileName,x.mediaType,x.byteSize,x.checksumSha256,x.category,x.description,x.storageProvider,x.storageReference,x.idempotencyKeyHash,s.userId], 'ATTACHMENT_BEGIN'); await repo.event(s, x.attachmentId, x.eventId, 'UPLOAD_STARTED', null, r.rows[0].version, x.occurredAt, { parentType: x.parentType, category: x.category }); return r.rows[0]; }); }
  async complete(s, id, version, x) { return this.transition(s, id, version, "upload_status='AVAILABLE',failure_code=NULL,checksum_sha256=$4,byte_size=$5", [x.checksumSha256,x.byteSize], x.eventId, 'UPLOAD_COMPLETED', x.occurredAt); }
  async fail(s, id, version, x) { return this.transition(s, id, version, "upload_status='FAILED',failure_code=$4", [x.failureCode], x.eventId, 'UPLOAD_FAILED', x.occurredAt); }
  async transition(s, id, version, setSql, extra, eventId, type, occurredAt) { const row=await this.transaction(async (repo) => { const r=await repo.query(`UPDATE atlas_contextual_attachments SET ${setSql},version=version+1,updated_at=$3 WHERE tenant_id=$1 AND attachment_id=$2 AND version=${setSql.includes('$5')?'$6':'$5'} AND upload_status<>'ARCHIVED' RETURNING *`, [s.tenantId,id,occurredAt,...extra,version], `ATTACHMENT_${type}`); if(r.rowCount!==1)return null; await repo.event(s,id,eventId,type,version,r.rows[0].version,occurredAt,{}); return r.rows[0]; });if(!row)throw errors.persistenceConflict();return row; }
  async updateMetadata(s,id,version,x){const row=await this.transaction(async(repo)=>{const r=await repo.query("UPDATE atlas_contextual_attachments SET category=$4,description=$5,version=version+1,updated_at=$3 WHERE tenant_id=$1 AND attachment_id=$2 AND version=$6 AND upload_status<>'ARCHIVED' RETURNING *",[s.tenantId,id,x.occurredAt,x.category,x.description,version],'ATTACHMENT_METADATA_UPDATE');if(r.rowCount!==1)return null;await repo.event(s,id,x.eventId,'METADATA_UPDATED',version,r.rows[0].version,x.occurredAt,{category:x.category});return r.rows[0];});if(!row)throw errors.persistenceConflict();return row;}
  async archive(s,id,version,x){const row=await this.transaction(async(repo)=>{const r=await repo.query("UPDATE atlas_contextual_attachments SET upload_status='ARCHIVED',archived_at=$3,updated_at=$3,version=version+1 WHERE tenant_id=$1 AND attachment_id=$2 AND version=$4 AND upload_status<>'ARCHIVED' RETURNING *",[s.tenantId,id,x.occurredAt,version],'ATTACHMENT_ARCHIVE');if(r.rowCount!==1)return null;await repo.event(s,id,x.eventId,'ARCHIVED',version,r.rows[0].version,x.occurredAt,{});return r.rows[0];});if(!row)throw errors.persistenceConflict();return row;}
  async event(s,id,eventId,type,previousVersion,newVersion,occurredAt,details){await this.query('INSERT INTO atlas_contextual_attachment_events(tenant_id,attachment_event_id,attachment_id,event_type,occurred_at,actor_user_id,correlation_id,previous_version,new_version,details_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',[s.tenantId,eventId,id,type,occurredAt,s.userId,s.correlationId,previousVersion,newVersion,JSON.stringify(details)],'ATTACHMENT_EVENT_APPEND');}
  async list(s,x){let cursorTime=null,cursorId=null;if(x.cursor){try{const parsed=JSON.parse(Buffer.from(x.cursor,'base64url').toString('utf8'));cursorTime=parsed.createdAt;cursorId=parsed.attachmentId;}catch{throw errors.invalidInput();}}const r=await this.query("SELECT attachment_id,parent_type,parent_id,file_name,media_type,byte_size,category,description,upload_status,processing_status,version,uploaded_by_user_id,created_at,updated_at FROM atlas_contextual_attachments WHERE tenant_id=$1 AND parent_type=$2 AND parent_id=$3 AND upload_status<>'ARCHIVED' AND ($4::timestamptz IS NULL OR (created_at,attachment_id)<($4::timestamptz,$5)) ORDER BY created_at DESC,attachment_id DESC LIMIT $6",[s.tenantId,x.parentType,x.parentId,cursorTime,cursorId,x.limit+1],'ATTACHMENT_PARENT_LIST');const more=r.rows.length>x.limit,items=r.rows.slice(0,x.limit),last=items.at(-1);return{items,nextCursor:more?Buffer.from(JSON.stringify({createdAt:last.created_at,attachmentId:last.attachment_id})).toString('base64url'):null};}
}
