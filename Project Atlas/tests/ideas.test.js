const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..', 'appscript', 'src');
const context = vm.createContext({
  Date, JSON, String, Number, Error, Object, Array, console,
  Utilities: { getUuid: (() => { let count = 0; return () => `uuid-${++count}`; })() },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
});
['Utilities/Errors.gs', 'Utilities/Serialization.gs', 'Utilities/Validation.gs', 'Services/IdeasService.gs'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context));
context.getVmosAuditUser_ = () => 'operator@example.com';
const ideas = [], events = [];
const ideasRepository = {
  list: () => ideas.slice(), findById: (id) => { const idea = ideas.find((item) => item.id === id); if (!idea) throw new context.VmosNotFoundError('missing'); return idea; },
  append: (idea) => { ideas.push({ ...idea }); return idea; }
};
const eventsRepository = {
  listByIdeaId: (id) => events.filter((event) => event.ideaId === id),
  append: (event) => { events.push({ ...event }); return event; }
};
const service = new context.IdeasService(ideasRepository, eventsRepository);
const idea = service.capture({ title: 'Swiss lathe', category: 'Equipment', description: 'Research future capacity.' });
assert.match(idea.id, /^IDEA-/);
assert.equal(idea.state, 'IDEA');
assert.equal(events[0].eventType, 'IDEA_CAPTURED');
assert.equal(ideas.length, 1, 'Capturing an idea only writes to the dedicated Ideas store.');
assert.equal(idea.jobId, undefined, 'Ideas are not Jobs or operational records.');
assert.throws(() => service.requestPromotion(idea.id, false), /Explicit promotion/);
const requested = service.requestPromotion(idea.id, true, 'Review with architect.');
assert.equal(requested.state, 'PROMOTION_REQUESTED');
assert.equal(events[1].eventType, 'PROMOTION_REQUESTED');
assert.throws(() => service.requestPromotion(idea.id, true), /already has/);
const config = fs.readFileSync(path.join(root, 'ConfigIdeas.gs'), 'utf8');
assert.match(config, /sheetName: 'IdeasBacklog'/);
assert.match(config, /sheetName: 'IdeaEvents'/);
assert.match(config, /initializeIdeasPersistence/);
console.log('VMOS Ideas service tests passed');
