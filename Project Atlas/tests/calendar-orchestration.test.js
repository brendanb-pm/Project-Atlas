const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'appscript', 'src');
let sequence = 0;
const context = vm.createContext({
  Date, Intl, Number, String, Object, Array, JSON,
  Utilities: { getUuid: () => String(++sequence) },
  VmosValidationError_: function (message) { this.message = message; },
  VmosNotFoundError_: function (message) { this.message = message; },
  VmosConfigurationError_: function (message) { this.message = message; }
});
[
  'Services/FollowUpCalendarService.gs',
  'Services/CalendarProviderFramework.gs',
  'Services/CalendarFollowUpOrchestrationService.gs'
].forEach((file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context));

const wallClock = new context.CalendarWallClockService_();
assert.equal(wallClock.toSchedule({date:'2026-01-15',startTime:'15:00',endTime:'15:30',timeZone:'America/Los_Angeles'}).startAt,'2026-01-15T23:00:00.000Z','Los Angeles standard time');
assert.equal(wallClock.toSchedule({date:'2026-08-12',startTime:'15:00',endTime:'15:30',timeZone:'America/Los_Angeles'}).startAt,'2026-08-12T22:00:00.000Z','Los Angeles daylight time');
assert.equal(wallClock.toSchedule({date:'2026-08-12',startTime:'15:00',endTime:'15:30',timeZone:'America/New_York'}).startAt,'2026-08-12T19:00:00.000Z','New York daylight time');
assert.throws(() => wallClock.toSchedule({date:'2026-03-08',startTime:'02:30',endTime:'03:30',timeZone:'America/Los_Angeles'}), error => /does not exist/.test(error.message),'nonexistent spring-forward time is rejected');
assert.throws(() => wallClock.toSchedule({date:'2026-11-01',startTime:'01:30',endTime:'02:30',timeZone:'America/Los_Angeles'}), error => /occurs twice/.test(error.message),'ambiguous fall-back time requires clarification');

const follows = [], events = [], connections = [], links = [], requests = [], calls = [];
const followRepo = {
  create: record => (follows.push(record), record),
  get: id => follows.find(record => record.id === id),
  update: (id, record) => (follows[follows.findIndex(value => value.id === id)] = record, record)
};
const connectionRepo = {
  create: record => (connections.push(record), record),
  get: id => connections.find(record => record.id === id),
  update: (id, record) => (connections[connections.findIndex(value => value.id === id)] = record, record),
  listByUserId: id => connections.filter(record => record.userId === id)
};
const linkRepo = {
  list: () => links,
  findByFollowUpId: id => links.find(record => record.followUpId === id),
  create: record => (links.push(record), record),
  update: (id, record) => (links[links.findIndex(value => value.id === id)] = record, record)
};
const requestRepo = {
  create: record => (requests.push(record), record),
  get: id => requests.find(record => record.id === id),
  update: (id, record) => (requests[requests.findIndex(value => value.id === id)] = record, record)
};
const clock = () => new Date('2026-08-08T12:00:00Z');
const followUps = new context.FollowUpService_({repository:followRepo,events:{append:event=>(events.push(event),event)},clock,id:prefix=>prefix+'-'+(++sequence)});
const connectionService = new context.CalendarConnectionService_({repository:connectionRepo,clock,id:prefix=>prefix+'-'+(++sequence)});
const google = connectionService.create({userId:'Josh',provider:'GOOGLE_CALENDAR',externalCalendarId:'google-sales',connectionStatus:'CONNECTED'});
const microsoft = connectionService.create({userId:'Brendan',provider:'MICROSOFT_GRAPH_CALENDAR',externalCalendarId:'outlook-sales',connectionStatus:'CONNECTED'});
const apple = connectionService.create({userId:'Taylor',provider:'APPLE_ICLOUD_CALENDAR',externalCalendarId:'icloud-sales',connectionStatus:'CONNECTED'});

let cleanupFailure = false;
let projectionFailure = false;
function fakeProvider(provider) {
  return {
    project(id, correlationId) {
      const follow = followRepo.get(id);
      const connection = connectionService.resolveWritableForOwner(follow.ownerUserId).connection;
      calls.push({type:'project',provider,id,correlationId,connectionId:connection.id});
      if (projectionFailure) return {result:'FAILED',error:'Provider timeout'};
      let link = linkRepo.findByFollowUpId(id);
      if (!link) {
        link = {id:'LINK-'+(++sequence),followUpId:id};
        linkRepo.create(link);
      }
      Object.assign(link,{connectionId:connection.id,provider,calendarId:connection.externalCalendarId,externalEventId:provider+'-EVENT',externalVersion:'v1'});
      return {result:'PUSHED',provider};
    },
    removeProjection(id, connection, correlationId) {
      calls.push({type:'remove',provider,id,correlationId,connectionId:connection.id});
      return cleanupFailure ? {result:'FAILED',error:'Provider cleanup timeout'} : {result:'REMOVED'};
    },
    removeExternalEvent(connection, externalEventId, externalVersion, correlationId) {
      calls.push({type:'retry-remove',provider,connectionId:connection.id,externalEventId,externalVersion,correlationId});
      return cleanupFailure ? {result:'FAILED',error:'Provider cleanup timeout'} : {result:'REMOVED'};
    }
  };
}
const providers = {
  GOOGLE_CALENDAR: fakeProvider('GOOGLE_CALENDAR'),
  MICROSOFT_GRAPH_CALENDAR: fakeProvider('MICROSOFT_GRAPH_CALENDAR'),
  APPLE_ICLOUD_CALENDAR: fakeProvider('APPLE_ICLOUD_CALENDAR')
};
const orchestration = new context.CalendarFollowUpOrchestrationService_({
  followUps, connections:connectionService, links:linkRepo, requests:requestRepo, events:{append:event=>(events.push(event),event)},
  providerServices:providers, wallClock, clock, id:prefix=>prefix+'-'+(++sequence)
});

const follow = followUps.create({customerId:'CUST-1',title:'Call owner',dueAt:'2026-08-12T09:00:00Z',ownerUserId:'Josh'},'Josh');
const dueBefore = follow.dueAt.toISOString();
let result = orchestration.schedule(follow.id,{date:'2026-08-12',startTime:'15:00',endTime:'15:30',timeZone:'America/Los_Angeles'},follow.version,'Josh','schedule-1');
assert.equal(result.sync.result,'PUSHED','writable owner connection invokes provider projection');
assert.equal(calls.filter(call => call.type === 'project').length,1);
assert.equal(follow.startAt.toISOString(),'2026-08-12T22:00:00.000Z');
assert.equal(follow.dueAt.toISOString(),dueBefore,'scheduling preserves Due At');
const projectsBeforeKeep = calls.filter(call=>call.type==='project').length;
result = orchestration.projectExisting(follow.id,'review-use-mos');
assert.equal(result.sync.result,'PUSHED','Keep FollowUp / Use MOS Time can recreate the authoritative projection');
assert.equal(calls.filter(call=>call.type==='project').length,projectsBeforeKeep+1);
const projectsBeforeRecreate = calls.filter(call=>call.type==='project').length;
result = orchestration.recreateExisting(follow.id,'review-recreate');
assert.equal(result.sync.result,'PUSHED','deleted external event is recreated from MOS schedule');
assert.equal(calls.filter(call=>call.type==='project').length,projectsBeforeRecreate+1);

const noCalendar = followUps.create({customerId:'CUST-2',title:'No calendar',dueAt:'2026-08-12T09:00:00Z',ownerUserId:'Other'},'Other');
result = orchestration.schedule(noCalendar.id,{date:'2026-08-12',startTime:'10:00',endTime:'10:30',timeZone:'America/Los_Angeles'},noCalendar.version,'Other','schedule-2');
assert.equal(result.sync.result,'NOT_CONNECTED');
assert.equal(noCalendar.startAt.toISOString(),'2026-08-12T17:00:00.000Z','no-calendar scheduling still commits MOS schedule');

projectionFailure = true;
const dueBeforeFailure = follow.dueAt.toISOString();
result = orchestration.schedule(follow.id,{date:'2026-08-13',startTime:'15:00',endTime:'15:30',timeZone:'America/Los_Angeles'},follow.version,'Josh','schedule-provider-failure');
assert.equal(result.sync.result,'FAILED');
assert.equal(follow.startAt.toISOString(),'2026-08-13T22:00:00.000Z','provider failure does not roll back valid MOS schedule');
assert.equal(follow.dueAt.toISOString(),dueBeforeFailure);
assert.equal(connectionService.get(google.id).lastError,'Provider timeout','provider failure becomes actionable connection health');
projectionFailure = false;

result = orchestration.reassign(follow.id,'Brendan',follow.version,'Manager','reassign-1');
assert.equal(result.previousOwnerUserId,'Josh');
assert.equal(result.cleanup.result,'REMOVED');
assert.equal(result.sync.result,'PUSHED');
assert.equal(follow.ownerUserId,'Brendan');
assert.equal(linkRepo.findByFollowUpId(follow.id).connectionId,microsoft.id,'Google to Microsoft projection is rerouted');

result = orchestration.reassign(follow.id,'Taylor',follow.version,'Manager','reassign-2');
assert.equal(result.sync.result,'PUSHED');
assert.equal(linkRepo.findByFollowUpId(follow.id).connectionId,apple.id,'Microsoft to Apple projection is rerouted');

cleanupFailure = true;
result = orchestration.reassign(follow.id,'Unconnected',follow.version,'Manager','reassign-3');
assert.equal(follow.ownerUserId,'Unconnected','cleanup failure never rolls back MOS ownership');
assert.equal(result.cleanup.result,'FAILED');
assert.equal(result.sync.result,'NOT_CONNECTED');
assert.equal(requests.at(-1).changeType,'CLEANUP_FAILED','failed cleanup creates reviewable attention record');
const cleanupRequest=requests.at(-1);
assert.equal(cleanupRequest.previousConnectionId,apple.id,'reassignment failure retains old connection');
assert.equal(cleanupRequest.provider,'APPLE_ICLOUD_CALENDAR');
assert.equal(cleanupRequest.externalEventId,'APPLE_ICLOUD_CALENDAR-EVENT');
assert.equal(cleanupRequest.cleanupOperation,'REASSIGNMENT');
let retry=orchestration.retryCleanup(cleanupRequest.id,'Manager','retry-1');
assert.equal(retry.result,'FAILED','failed retry preserves actionable request');
assert.equal(cleanupRequest.status,'PENDING_REVIEW');
cleanupFailure=false;
retry=orchestration.retryCleanup(cleanupRequest.id,'Manager','retry-2');
assert.equal(retry.result,'RESOLVED');
assert.equal(calls.at(-1).connectionId,apple.id,'retry routes through previous connection');
assert.equal(orchestration.retryCleanup(cleanupRequest.id,'Manager','retry-3').result,'ALREADY_RESOLVED','resolved retry is idempotent');

const legacy=requestRepo.create({id:'LEGACY-CLEANUP',followUpId:follow.id,provider:'GOOGLE_CALENDAR',externalEventId:'old',changeType:'CLEANUP_FAILED',status:'PENDING_REVIEW'});
assert.equal(orchestration.retryCleanup(legacy.id,'Manager','legacy').result,'FAILED','legacy cleanup without connection fails safely');
const ownerBeforeAck=follow.ownerUserId;
assert.equal(orchestration.acknowledgeCleanup(legacy.id,'Manager','ack').result,'RESOLVED');
assert.equal(follow.ownerUserId,ownerBeforeAck,'acknowledge does not alter FollowUp lifecycle or ownership');
const unavailable=requestRepo.create({id:'UNAVAILABLE-CLEANUP',followUpId:follow.id,previousConnectionId:microsoft.id,provider:'MICROSOFT_GRAPH_CALENDAR',externalEventId:'old-ms',changeType:'CLEANUP_FAILED',status:'PENDING_REVIEW'});
const microsoftProvider=providers.MICROSOFT_GRAPH_CALENDAR;
delete providers.MICROSOFT_GRAPH_CALENDAR;
assert.equal(orchestration.retryCleanup(unavailable.id,'Manager','unavailable').result,'FAILED','unavailable provider remains actionable');
assert.equal(unavailable.status,'PENDING_REVIEW');
providers.MICROSOFT_GRAPH_CALENDAR=microsoftProvider;
['CALENDAR_CLEANUP_FAILED','CALENDAR_CLEANUP_RETRY_ATTEMPTED','CALENDAR_CLEANUP_RETRY_SUCCEEDED','CALENDAR_CLEANUP_RETRY_FAILED','CALENDAR_CLEANUP_ACKNOWLEDGED'].forEach(type=>assert.ok(events.some(event=>event.eventType===type),'audit includes '+type));

const disabledFollow = followUps.create({customerId:'CUST-3',title:'Disabled integration',dueAt:'2026-08-12T09:00:00Z',ownerUserId:'Brendan'},'Brendan');
const disabled = new context.CalendarFollowUpOrchestrationService_({followUps,connections:connectionService,links:linkRepo,requests:requestRepo,providerServices:providers,wallClock,clock,enabled:false,id:prefix=>prefix+'-'+(++sequence)});
const projectsBeforeDisabled = calls.filter(call=>call.type==='project').length;
result = disabled.schedule(disabledFollow.id,{date:'2026-08-14',startTime:'09:00',endTime:'09:30',timeZone:'America/New_York'},disabledFollow.version,'Brendan','disabled-1');
assert.equal(result.sync.result,'DISABLED');
assert.equal(calls.filter(call=>call.type==='project').length,projectsBeforeDisabled,'feature-disabled scheduling never invokes provider');
assert.ok(disabledFollow.startAt,'feature-disabled scheduling remains valid in MOS');

cleanupFailure = false;
const disconnectFollow = followUps.create({customerId:'CUST-4',title:'Disconnect safely',dueAt:'2026-08-12T09:00:00Z',ownerUserId:'Josh'},'Josh');
result = orchestration.schedule(disconnectFollow.id,{date:'2026-08-15',startTime:'11:00',endTime:'11:30',timeZone:'America/Los_Angeles'},disconnectFollow.version,'Josh','disconnect-schedule');
assert.equal(result.sync.result,'PUSHED');
cleanupFailure=true;
result = orchestration.disconnect(google.id,'Josh','disconnect-1');
assert.equal(result.connection.connectionStatus,'DISCONNECTED');
assert.equal(disconnectFollow.status,'OPEN','disconnect preserves FollowUp lifecycle');
assert.equal(requests.at(-1).previousConnectionId,google.id,'disconnect failure retains old connection');
assert.equal(requests.at(-1).cleanupOperation,'DISCONNECT');
assert.equal(linkRepo.findByFollowUpId(disconnectFollow.id).externalEventId,'','disconnect clears reconciled projection identity');

console.log('VMOS calendar orchestration and timezone regression tests passed');
