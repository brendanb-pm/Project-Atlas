/**
 * Storage-neutral persistence seam. Domain services retain their existing
 * repository vocabulary during transition; new provider-aware code uses the
 * scoped methods below. A future PostgreSQL provider implements this same
 * contract with stronger transaction and indexed-query capabilities.
 */
var ATLAS_PERSISTENCE_DEFAULT_LIMIT_ = 50;
var ATLAS_PERSISTENCE_MAX_LIMIT_ = 200;

function createTenantPersistenceScope_(auditContext) {
  if (!auditContext || auditContext.authoritative !== true || !auditContext.tenantId) {
    throw new VmosError_('Trusted tenant persistence context is required.', 'AUTHORIZATION_ERROR');
  }
  return Object.freeze({ kind: 'TENANT', tenantId: String(auditContext.tenantId), actorId: String(auditContext.userId || ''), authoritative: true });
}
function createControlPlanePersistenceScope_(systemContext) {
  if (!systemContext || systemContext.authoritative !== true || systemContext.actorType !== 'SYSTEM') {
    throw new VmosError_('Trusted control-plane persistence context is required.', 'AUTHORIZATION_ERROR');
  }
  return Object.freeze({ kind: 'CONTROL_PLANE', actorId: String(systemContext.userId || ''), authoritative: true });
}
function assertPersistenceScope_(scope, requiresTenant) {
  if (!scope || scope.authoritative !== true || (scope.kind !== 'TENANT' && scope.kind !== 'CONTROL_PLANE')) {
    throw new VmosError_('Trusted persistence context is required.', 'AUTHORIZATION_ERROR');
  }
  if (requiresTenant && (scope.kind !== 'TENANT' || !scope.tenantId)) throw new VmosError_('Trusted tenant persistence context is required.', 'AUTHORIZATION_ERROR');
  return scope;
}
function persistenceLimit_(value, maximum) {
  if (value === undefined || value === null || value === '') throw new VmosValidationError_('A bounded persistence read limit is required.');
  var limit = Number(value), cap = Number(maximum || ATLAS_PERSISTENCE_MAX_LIMIT_);
  if (!isFinite(limit) || Math.floor(limit) !== limit || limit < 1) throw new VmosValidationError_('Persistence read limit is invalid.');
  return Math.min(limit, cap);
}
function persistenceCursor_(value) {
  if (!value) return null;
  try { return JSON.parse(decodeURIComponent(String(value))); }
  catch (ignored) { throw new VmosValidationError_('Persistence cursor is invalid.'); }
}
function persistenceNextCursor_(record, orderBy) {
  if (!record) return '';
  return encodeURIComponent(JSON.stringify({ v: 1, field: orderBy.field, direction: orderBy.direction, value: record[orderBy.field], id: record.id }));
}
function persistenceCompare_(left, right, orderBy) {
  var direction = orderBy.direction === 'DESC' ? -1 : 1;
  var a = left[orderBy.field], b = right[orderBy.field];
  if (String(a === undefined || a === null ? '' : a) < String(b === undefined || b === null ? '' : b)) return -1 * direction;
  if (String(a === undefined || a === null ? '' : a) > String(b === undefined || b === null ? '' : b)) return 1 * direction;
  if (String(left.id) < String(right.id)) return -1 * direction;
  if (String(left.id) > String(right.id)) return 1 * direction;
  return 0;
}
function persistenceAfterCursor_(record, cursor, orderBy) {
  if (!cursor) return true;
  if (cursor.v !== 1 || cursor.field !== orderBy.field || cursor.direction !== orderBy.direction) throw new VmosValidationError_('Persistence cursor does not match this query.');
  return persistenceCompare_(record, { id: cursor.id, value: cursor.value, [orderBy.field]: cursor.value }, orderBy) > 0;
}

function SheetsPersistenceProvider_(options) {
  options = options || {};
  this.entityName = options.entityName;
  this.definition = options.definition || {};
  this.tenantField = options.tenantField || '';
  this.versionField = options.versionField || 'version';
  this.appendOnly = options.appendOnly === true;
  this.maximum = Number(options.maximum || ATLAS_PERSISTENCE_MAX_LIMIT_);
  this.repository = options.repository || new SheetsRepository_(this.entityName, this.definition, options.spreadsheet);
}
SheetsPersistenceProvider_.prototype.capabilities = function () {
  return Object.freeze({ provider: 'SHEETS', atomicTransactions: false, optimisticConcurrency: true, indexedSearch: false, cursorPagination: true, boundedRoutineReads: true, bulkMigration: false });
};
SheetsPersistenceProvider_.prototype.assertTenantRecord_ = function (scope, record) {
  assertPersistenceScope_(scope, !!this.tenantField);
  if (!this.tenantField) return record;
  if (!record || String(record[this.tenantField] || '') !== String(scope.tenantId)) throw new VmosError_('The requested record is unavailable.', 'AUTHORIZATION_ERROR');
  return record;
};
SheetsPersistenceProvider_.prototype.getForScope = function (scope, id) {
  return this.assertTenantRecord_(scope, this.repository.findById(id));
};
SheetsPersistenceProvider_.prototype.existsForScope = function (scope, id) {
  try { this.getForScope(scope, id); return true; }
  catch (error) { if (error && error.code === 'NOT_FOUND') return false; throw error; }
};
SheetsPersistenceProvider_.prototype.listForScope = function (scope, request) {
  request = request || {};
  assertPersistenceScope_(scope, !!this.tenantField);
  var limit = persistenceLimit_(request.limit, Math.min(this.maximum, ATLAS_PERSISTENCE_MAX_LIMIT_));
  var filters = request.filters || {}, orderBy = request.orderBy || { field: 'id', direction: 'ASC' }, direction = String(orderBy.direction || 'ASC').toUpperCase(), field = String(orderBy.field || 'id');
  if (direction !== 'ASC' && direction !== 'DESC') throw new VmosValidationError_('Persistence sort direction is invalid.');
  if (field !== 'id' && !(this.definition.fields || {})[field]) throw new VmosValidationError_('Persistence sort field is invalid.');
  Object.keys(filters).forEach(function (key) { if (key !== 'id' && !(this.definition.fields || {})[key]) throw new VmosValidationError_('Persistence filter field is invalid.'); }, this);
  var cursor = persistenceCursor_(request.cursor), ordering = { field: field, direction: direction }, rows = this.repository.list().filter(function (record) {
    if (this.tenantField && String(record[this.tenantField] || '') !== String(scope.tenantId)) return false;
    return Object.keys(filters).every(function (key) { return String(record[key] === undefined ? '' : record[key]) === String(filters[key]); });
  }, this).sort(function (left, right) { return persistenceCompare_(left, right, ordering); }).filter(function (record) { return persistenceAfterCursor_(record, cursor, ordering); });
  var items = rows.slice(0, limit), hasMore = rows.length > items.length;
  return { items: items, limit: limit, hasMore: hasMore, nextCursor: hasMore ? persistenceNextCursor_(items[items.length - 1], ordering) : '', orderBy: ordering };
};
SheetsPersistenceProvider_.prototype.findUniqueForScope = function (scope, criteria) {
  var result = this.listForScope(scope, { limit: 2, filters: criteria || {}, orderBy: { field: 'id', direction: 'ASC' } });
  if (result.items.length > 1) throw new VmosConflictError('Persistence uniqueness is ambiguous.');
  return result.items[0];
};
SheetsPersistenceProvider_.prototype.prepareWrite_ = function (scope, record) {
  assertPersistenceScope_(scope, !!this.tenantField);
  var prepared = {}, self = this;
  Object.keys(record || {}).forEach(function (key) { prepared[key] = record[key]; });
  if (this.tenantField) {
    if (prepared[this.tenantField] && String(prepared[this.tenantField]) !== String(scope.tenantId)) throw new VmosError_('The requested record is unavailable.', 'AUTHORIZATION_ERROR');
    prepared[this.tenantField] = scope.tenantId;
  }
  return prepared;
};
SheetsPersistenceProvider_.prototype.createForScope = function (scope, record, options) {
  var prepared = this.prepareWrite_(scope, record), prior;
  if (!prepared.id) throw new VmosValidationError_('Canonical record ID is required.');
  options = options || {};
  if (options.idempotencyCriteria) {
    prior = this.findUniqueForScope(scope, options.idempotencyCriteria);
    if (prior) return { record: prior, replayed: true };
  }
  return { record: this.repository.insertUnique ? this.repository.insertUnique(prepared) : this.repository.insert(prepared), replayed: false };
};
SheetsPersistenceProvider_.prototype.updateForScope = function (scope, id, changes, options) {
  options = options || {};
  changes = changes || {};
  if (Object.prototype.hasOwnProperty.call(changes, 'id') || (this.tenantField && Object.prototype.hasOwnProperty.call(changes, this.tenantField))) throw new VmosValidationError_('Persistence identity cannot be changed.');
  var current = this.getForScope(scope, id), prepared = this.prepareWrite_(scope, changes);
  if (this.tenantField) delete prepared[this.tenantField];
  if (this.appendOnly) throw new VmosTransactionUnsupportedError_('Append-only persistence records cannot be updated.');
  if (options.expectedVersion !== undefined && Number(current[this.versionField] || 0) !== Number(options.expectedVersion)) throw new VmosConflictError('This record changed elsewhere. Refresh and review it before trying again.');
  return this.repository.updateById(id, prepared);
};
SheetsPersistenceProvider_.prototype.archiveForScope = function (scope, id, changes, options) {
  var update = changes || {};
  if (!Object.keys(update).length) update.status = 'ARCHIVED';
  return this.updateForScope(scope, id, update, options);
};
SheetsPersistenceProvider_.prototype.appendForScope = function (scope, event, options) {
  if (!this.appendOnly && !(options && options.allowAppend === true)) throw new VmosTransactionUnsupportedError_('This persistence collection does not support append-only writes.');
  return this.createForScope(scope, event, options).record;
};
SheetsPersistenceProvider_.prototype.runInTransaction = function () { throw new VmosTransactionUnsupportedError_(); };

/* Legacy aliases preserve existing repositories while they migrate to scopes. */
SheetsPersistenceProvider_.prototype.list = function () { return this.repository.list(); };
SheetsPersistenceProvider_.prototype.findById = function (id) { return this.repository.findById(id); };
SheetsPersistenceProvider_.prototype.findFirstByFields = function (criteria) { return this.repository.findFirstByFields(criteria); };
SheetsPersistenceProvider_.prototype.insert = function (record) { return this.repository.insert(record); };
SheetsPersistenceProvider_.prototype.insertUnique = function (record) { return this.repository.insertUnique(record); };
SheetsPersistenceProvider_.prototype.updateById = function (id, changes) { return this.repository.updateById(id, changes); };

function AtlasPersistenceProviderRegistry_(dependencies) {
  dependencies = dependencies || {};
  this.config = dependencies.config || getAtlasPersistenceConfig_();
  this.sheetsFactory = dependencies.sheetsFactory || function (options) { return new SheetsPersistenceProvider_(options); };
  this.postgresqlFactory = dependencies.postgresqlFactory || null;
}
AtlasPersistenceProviderRegistry_.prototype.create = function (options) {
  var provider = String(this.config.provider || '').toUpperCase();
  if (provider === ATLAS_PERSISTENCE_PROVIDER_TYPES_.SHEETS) return this.sheetsFactory(options);
  if (provider === ATLAS_PERSISTENCE_PROVIDER_TYPES_.POSTGRESQL) {
    if (typeof this.postgresqlFactory !== 'function') throw new VmosProviderUnavailableError_('The selected Atlas storage provider is unavailable.');
    return this.postgresqlFactory(options);
  }
  throw new VmosConfigurationError_('Atlas persistence provider configuration is invalid.');
};
function createAtlasPersistenceProvider_(options, dependencies) {
  return new AtlasPersistenceProviderRegistry_(dependencies).create(options);
}
