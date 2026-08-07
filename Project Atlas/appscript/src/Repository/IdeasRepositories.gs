/** Repository wrappers for the separate, append-only Ideas/Future Backlog. */
function createIdeasRepository_(entityName, mapping) {
  var config = getIdeasConfig_();
  return new SheetsRepository(entityName, mapping, SpreadsheetApp.openById(config.spreadsheetId));
}

function IdeasRepository() { this.repository = createIdeasRepository_('Idea', getIdeasConfig_().ideaMapping); }
IdeasRepository.prototype.list = function () { return this.repository.list(); };
IdeasRepository.prototype.findById = function (id) { return this.repository.findById(id); };
IdeasRepository.prototype.append = function (idea) {
  if (!idea || !idea.id) throw new VmosValidationError('Idea ID is required.');
  return this.repository.insert(idea);
};

function IdeaEventRepository() { this.repository = createIdeasRepository_('IdeaEvent', getIdeasConfig_().eventMapping); }
IdeaEventRepository.prototype.list = function () { return this.repository.list(); };
IdeaEventRepository.prototype.append = function (event) {
  if (!event || !event.id || !event.ideaId) throw new VmosValidationError('Idea event ID and Idea ID are required.');
  return this.repository.insert(event);
};
IdeaEventRepository.prototype.listByIdeaId = function (ideaId) {
  return this.list().filter(function (event) { return String(event.ideaId) === String(ideaId); });
};
