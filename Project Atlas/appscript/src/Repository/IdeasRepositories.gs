/** Repository wrappers for the separate, append-only Ideas/Future Backlog. */
function createIdeasRepository_(entityName, mapping) {
  var config = getIdeasConfig_();
  return new SheetsRepository_(entityName, mapping, SpreadsheetApp.openById(config.spreadsheetId));
}

function IdeasRepository_() { this.repository = createIdeasRepository_('Idea', getIdeasConfig_().ideaMapping); }
IdeasRepository_.prototype.list = function () { return this.repository.list(); };
IdeasRepository_.prototype.findById = function (id) { return this.repository.findById(id); };
IdeasRepository_.prototype.append = function (idea) {
  if (!idea || !idea.id) throw new VmosValidationError_('Idea ID is required.');
  return this.repository.insert(idea);
};

function IdeaEventRepository_() { this.repository = createIdeasRepository_('IdeaEvent', getIdeasConfig_().eventMapping); }
IdeaEventRepository_.prototype.list = function () { return this.repository.list(); };
IdeaEventRepository_.prototype.append = function (event) {
  if (!event || !event.id || !event.ideaId) throw new VmosValidationError_('Idea event ID and Idea ID are required.');
  return this.repository.insert(event);
};
IdeaEventRepository_.prototype.listByIdeaId = function (ideaId) {
  return this.list().filter(function (event) { return String(event.ideaId) === String(ideaId); });
};
