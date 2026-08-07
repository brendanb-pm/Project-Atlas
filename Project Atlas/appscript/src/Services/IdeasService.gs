/**
 * Future ideas are intentionally not Jobs, RFQs, or production tasks. Both
 * capture and promotion are append-only records; promotion only signals an
 * explicit handoff request and never creates a project or task.
 */
function IdeasService(ideasRepository, eventsRepository) {
  this.ideas = ideasRepository || new IdeasRepository();
  this.events = eventsRepository || new IdeaEventRepository();
}

IdeasService.prototype.list = function () {
  var self = this;
  return this.ideas.list().map(function (idea) { return self.toView_(idea); })
    .sort(function (left, right) { return String(right.createdAt || '').localeCompare(String(left.createdAt || '')); });
};

IdeasService.prototype.capture = function (input) {
  input = input || {};
  requireValue_(input.title, 'title');
  var now = new Date(), idea = {
    id: 'IDEA-' + Utilities.getUuid().toUpperCase(), title: input.title, description: input.description || '',
    category: input.category || '', createdAt: now, createdBy: getVmosAuditUser_()
  };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    this.ideas.append(idea);
    this.appendEvent_(idea.id, 'IDEA_CAPTURED', input.note || 'Idea captured.');
    return this.toView_(idea);
  } finally { lock.releaseLock(); }
};

IdeasService.prototype.requestPromotion = function (ideaId, confirmation, note) {
  if (!ideaId) throw new VmosValidationError('Idea ID is required.');
  if (confirmation !== true) throw new VmosValidationError('Explicit promotion confirmation is required.');
  this.ideas.findById(ideaId);
  var existing = this.events.listByIdeaId(ideaId).filter(function (event) { return event.eventType === 'PROMOTION_REQUESTED'; })[0];
  if (existing) throw new VmosValidationError('This idea already has an explicit promotion request.');
  this.appendEvent_(ideaId, 'PROMOTION_REQUESTED', note || 'Explicitly requested for architecture/client review.');
  return this.toView_(this.ideas.findById(ideaId));
};

IdeasService.prototype.toView_ = function (idea) {
  var events = this.events.listByIdeaId(idea.id), promotion = events.filter(function (event) { return event.eventType === 'PROMOTION_REQUESTED'; })[0];
  return serializeVmosValue_({
    id: idea.id, title: idea.title, description: idea.description, category: idea.category,
    createdAt: idea.createdAt, createdBy: idea.createdBy,
    state: promotion ? 'PROMOTION_REQUESTED' : 'IDEA', promotionRequestedAt: promotion && promotion.occurredAt,
    promotionNote: promotion && promotion.note
  });
};

IdeasService.prototype.appendEvent_ = function (ideaId, eventType, note) {
  return this.events.append({
    id: 'IDEA-EVT-' + Utilities.getUuid().toUpperCase(), ideaId: ideaId, eventType: eventType,
    occurredAt: new Date(), actor: getVmosAuditUser_(), note: note || ''
  });
};
