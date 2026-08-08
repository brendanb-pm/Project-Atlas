/** MOS-117E-4 provider-neutral operator orchestration and wall-clock conversion. */
function CalendarWallClockService() {}

CalendarWallClockService.prototype.toSchedule = function (input) {
  input = input || {};
  if (input.startAt || input.endAt) {
    return { startAt: input.startAt, endAt: input.endAt, timeZone: input.timeZone };
  }
  if (!input.date || !input.startTime || !input.endTime || !input.timeZone) {
    throw new VmosValidationError('Date, start time, end time, and time zone are required.');
  }
  var startAt = this.toInstant_(input.date, input.startTime, input.timeZone);
  var endAt = this.toInstant_(input.date, input.endTime, input.timeZone);
  if (new Date(endAt) <= new Date(startAt)) {
    throw new VmosValidationError('End time must be after start time.');
  }
  return { startAt: startAt, endAt: endAt, timeZone: input.timeZone };
};

CalendarWallClockService.prototype.toInstant_ = function (dateText, timeText, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText)) || !/^\d{2}:\d{2}$/.test(String(timeText))) {
    throw new VmosValidationError('Use a valid date and time.');
  }
  var parts = String(dateText).split('-').concat(String(timeText).split(':')).map(Number);
  var validation = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], 0, 0));
  if (validation.getUTCFullYear() !== parts[0] || validation.getUTCMonth() !== parts[1] - 1 ||
      validation.getUTCDate() !== parts[2] || validation.getUTCHours() !== parts[3] ||
      validation.getUTCMinutes() !== parts[4]) {
    throw new VmosValidationError('Use a valid calendar date and time.');
  }
  var formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
  } catch (error) {
    throw new VmosValidationError('Select a valid IANA time zone.');
  }
  var target = { year: parts[0], month: parts[1], day: parts[2], hour: parts[3], minute: parts[4] };
  var naive = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);
  var matches = [];
  for (var offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    var instant = new Date(naive - offsetMinutes * 60000);
    var formatted = this.parts_(formatter, instant);
    if (formatted.year === target.year && formatted.month === target.month && formatted.day === target.day &&
        formatted.hour === target.hour && formatted.minute === target.minute) {
      if (matches.indexOf(instant.toISOString()) === -1) matches.push(instant.toISOString());
    }
  }
  if (!matches.length) {
    throw new VmosValidationError('That local time does not exist because of a daylight-saving transition. Choose another time.');
  }
  if (matches.length > 1) {
    throw new VmosValidationError('That local time occurs twice because of a daylight-saving transition. Choose a different time.');
  }
  return matches[0];
};

CalendarWallClockService.prototype.parts_ = function (formatter, instant) {
  var result = {};
  formatter.formatToParts(instant).forEach(function (part) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  });
  return result;
};

function CalendarFollowUpOrchestrationService(deps) {
  this.deps = deps || {};
  this.followUps = this.deps.followUps;
  this.connections = this.deps.connections;
  this.routing = this.deps.routing || new FollowUpCalendarRoutingService(this.connections);
  this.links = this.deps.links;
  this.requests = this.deps.requests;
  this.providerServices = this.deps.providerServices || {};
  this.enabled = this.deps.enabled !== false;
  this.wallClock = this.deps.wallClock || new CalendarWallClockService();
  this.clock = this.deps.clock || function () { return new Date(); };
  this.id = this.deps.id || function (prefix) { return prefix + '-' + Utilities.getUuid().toUpperCase(); };
}

CalendarFollowUpOrchestrationService.prototype.schedule = function (id, input, expectedVersion, actor, correlationId) {
  var schedule = this.wallClock.toSchedule(input);
  var followUp = this.followUps.schedule(id, schedule, expectedVersion, actor, correlationId);
  return { followUp: followUp, sync: this.project_(followUp, correlationId) };
};

CalendarFollowUpOrchestrationService.prototype.project_ = function (followUp, correlationId) {
  if (!this.enabled) return { result: 'DISABLED', followUpId: followUp.id };
  var route = this.routing.destinationFor(followUp);
  if (route.state !== 'CONNECTED') return { result: 'NOT_CONNECTED', followUpId: followUp.id };
  var service = this.providerServices[route.connection.provider];
  if (!service || typeof service.project !== 'function') {
    this.connections.update(route.connection.id, { lastError: 'Calendar authorization is not configured.' });
    return { result: 'NOT_CONFIGURED', followUpId: followUp.id, provider: route.connection.provider };
  }
  try {
    var result = service.project(followUp.id, correlationId);
    if (result && result.result === 'FAILED') {
      this.connections.update(route.connection.id, { lastError: result.error || result.details || 'Calendar synchronization failed.' });
    } else if (result && result.result === 'PUSHED') {
      this.connections.update(route.connection.id, { lastError: '', lastSyncAt: this.clock(), lastSuccessfulSyncAt: this.clock() });
    }
    return result;
  } catch (error) {
    this.connections.update(route.connection.id, { lastError: error.message });
    return { result: 'FAILED', followUpId: followUp.id, provider: route.connection.provider, error: error.message };
  }
};

CalendarFollowUpOrchestrationService.prototype.reassign = function (id, ownerUserId, expectedVersion, actor, correlationId) {
  var before = this.followUps.repository.get(id);
  var previousOwnerUserId = before.ownerUserId;
  var oldLink = this.links.findByFollowUpId(id);
  var oldConnection = oldLink && oldLink.connectionId ? this.connections.get(oldLink.connectionId) : null;
  var followUp = this.followUps.reassign(id, ownerUserId, expectedVersion, actor, correlationId);
  var cleanup = this.cleanup_(followUp, oldLink, oldConnection, correlationId + ':old-owner');
  this.resetLink_(oldLink);
  var projection = this.project_(followUp, correlationId + ':new-owner');
  return { followUp: followUp, previousOwnerUserId: previousOwnerUserId, cleanup: cleanup, sync: projection };
};

CalendarFollowUpOrchestrationService.prototype.disconnect = function (connectionId, actor, correlationId) {
  var connection = this.connections.get(connectionId);
  if (!connection) throw new VmosNotFoundError('Calendar connection not found.');
  if (connection.userId !== actor) throw new VmosValidationError('You may disconnect only your own calendar.');
  var self = this;
  var results = (this.links.list ? this.links.list() : []).filter(function (link) {
    return link.connectionId === connectionId && !!link.externalEventId;
  }).map(function (link, index) {
    var followUp = self.followUps.repository.get(link.followUpId);
    var result = self.cleanup_(followUp, link, connection, correlationId + ':' + index);
    self.resetLink_(link);
    return result;
  });
  var updated = this.connections.update(connectionId, { connectionStatus: 'DISCONNECTED', lastError: '' });
  return { connection: updated, cleanup: results };
};

CalendarFollowUpOrchestrationService.prototype.cleanup_ = function (followUp, link, connection, correlationId) {
  if (!link || !link.externalEventId) return { result: 'NOT_LINKED' };
  if (!this.enabled) {
    var disabled = { result: 'DISABLED', error: 'Calendar synchronization is disabled.' };
    this.attention_(followUp, link, disabled, correlationId);
    return disabled;
  }
  var service = connection && this.providerServices[connection.provider];
  var result;
  try {
    result = service && typeof service.removeProjection === 'function'
      ? service.removeProjection(followUp.id, connection, correlationId)
      : { result: 'NOT_CONFIGURED' };
  } catch (error) {
    result = { result: 'FAILED', error: error.message };
  }
  if (result.result !== 'REMOVED') this.attention_(followUp, link, result, correlationId);
  return result;
};

CalendarFollowUpOrchestrationService.prototype.attention_ = function (followUp, link, result, correlationId) {
  if (!this.requests) return;
  this.requests.create({
    id: this.id('ECR'), provider: link.provider, followUpId: followUp.id,
    externalEventId: link.externalEventId, changeType: 'CLEANUP_FAILED',
    requestedStartAt: followUp.startAt || '', requestedEndAt: followUp.endAt || '',
    requestedTimeZone: followUp.timeZone || '', externalVersion: link.externalVersion || '',
    status: 'PENDING_REVIEW', details: (result && result.error) || 'Old calendar projection requires reconciliation.',
    detectedAt: this.clock(), resolvedAt: '', resolvedBy: '', resolution: '', correlationId: correlationId
  });
};

CalendarFollowUpOrchestrationService.prototype.resetLink_ = function (link) {
  if (!link) return;
  link.connectionId = '';
  link.calendarId = '';
  link.externalEventId = '';
  link.externalVersion = '';
  link.lastSyncOrigin = 'REASSIGNED';
  link.updatedAt = this.clock();
  this.links.update(link.id, link);
};

function createCalendarFollowUpOrchestration_() {
  var connections = new CalendarConnectionService({ repository: new UserCalendarConnectionRepository() });
  var providerServices = typeof createConfiguredCalendarProviderServices_ === 'function'
    ? createConfiguredCalendarProviderServices_()
    : {};
  return new CalendarFollowUpOrchestrationService({
    followUps: createFollowUpService_(), connections: connections,
    routing: new FollowUpCalendarRoutingService(connections),
    links: new CalendarFollowUpLinkRepository(), requests: new ExternalChangeRequestRepository(),
    providerServices: providerServices,
    enabled: getCalendarFollowUpConfig_().enabled
  });
}

function getConfiguredCalendarProviderKeys_() {
  if (typeof createConfiguredCalendarProviderServices_ !== 'function') return [];
  var services = createConfiguredCalendarProviderServices_() || {};
  return Object.keys(services);
}
