const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({Date,Number,String,Object,Array,JSON,VmosConfigurationError:function(m){this.message=m}});
vm.runInContext(fs.readFileSync(path.join(base,'Repository','FollowUpRepositories.gs'),'utf8'),context);
const rows=[],calls=[];
const backing={
  definition:{fields:{id:1,provider:1,followUpId:1,connectionId:1,externalEventId:1,operation:1,changeType:1,correlationId:1,mosVersion:1,externalVersion:1,result:1,details:1,providerDurationMs:1,repositoryDurationMs:1,totalDurationMs:1,recoveryRequired:1,occurredAt:1}},
  insert(record){rows.push(record);return record},
  findFirstByFields(criteria){calls.push(criteria);return rows.find(row=>row.provider===criteria.provider&&row.correlationId===criteria.correlationId)},
  list(){throw new Error('optimized correlation lookup must not read the full event dataset')}
};
const repository=new context.CalendarSyncEventRepository(backing);
const event={id:'CSE-1',provider:'GOOGLE_CALENDAR',followUpId:'FUP-1',connectionId:'UCC-1',externalEventId:'event-1',operation:'INBOUND_RECONCILE',changeType:'UPSERT',correlationId:'correlation-1',mosVersion:3,externalVersion:'etag-1',result:'APPLIED',details:'FUP-1',providerDurationMs:12,repositoryDurationMs:4,totalDurationMs:20,recoveryRequired:false,occurredAt:new Date('2026-08-08T12:00:00Z')};
const appended=repository.append(event);assert.equal(appended.id,event.id);assert.equal(appended.correlationId,event.correlationId);assert.equal(appended.totalDurationMs,event.totalDurationMs);
assert.equal(repository.findByCorrelation('GOOGLE_CALENDAR','correlation-1').id,event.id,'correlation lookup returns durable event');
assert.deepEqual(calls[0],{provider:'GOOGLE_CALENDAR',correlationId:'correlation-1'});
const config=fs.readFileSync(path.join(base,'ConfigFollowUpCalendar.gs'),'utf8');
['CalendarSyncEvents','CalendarSyncEventID','FollowUpID','ConnectionID','Operation','Change Type','Correlation ID','MOS Version','External Version','Provider Duration Ms','Repository Duration Ms','Total Duration Ms','Recovery Required'].forEach(header=>assert.ok(config.includes(header),'mapping includes '+header));
const ui=fs.readFileSync(path.join(base,'UI','Code.gs'),'utf8');
assert.ok(ui.includes('syncEvents:new CalendarSyncEventRepository()'),'production reconciliation uses durable sync events');
assert.ok(!ui.includes('syncEvents:{append:function(){},findByCorrelation:function(){}}'),'production reconciliation has no sync-event no-op');
console.log('VMOS durable calendar sync-event persistence tests passed');
