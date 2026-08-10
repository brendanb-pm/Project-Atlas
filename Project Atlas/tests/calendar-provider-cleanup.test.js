const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');
const context=vm.createContext({Date,Number,String,Object,Array,JSON,VmosValidationError_:function(m){this.message=m},VmosConfigurationError_:function(m){this.message=m}});
['Services/FollowUpCalendarService.gs','Services/CalendarProviderFramework.gs','Services/GoogleCalendarAdapterService.gs','Services/MicrosoftGraphCalendarAdapterService.gs','Services/AppleIcloudCalendarAdapterService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context));
const calls=[];
const gateway={deleteEvent:payload=>(calls.push(payload),{deleted:true})};
const fixtures=[
  {adapter:new context.GoogleCalendarProviderAdapter_(gateway),connection:{provider:'GOOGLE_CALENDAR'},versionKey:'expectedEtag'},
  {adapter:new context.MicrosoftGraphCalendarProviderAdapter_(gateway),connection:{provider:'MICROSOFT_GRAPH_CALENDAR'},versionKey:'expectedChangeKey'},
  {adapter:new context.AppleIcloudCalendarProviderAdapter_(gateway),connection:{provider:'APPLE_ICLOUD_CALENDAR'},versionKey:'expectedEtag'}
];
fixtures.forEach((fixture,index)=>{
  fixture.adapter.remove({connection:fixture.connection,externalEventId:'event-'+index,expectedExternalVersion:'version-'+index,correlationId:'cleanup-'+index});
  assert.equal(calls[index].externalEventId,'event-'+index);
  assert.equal(calls[index][fixture.versionKey],'version-'+index);
  assert.equal(calls[index].correlationId,'cleanup-'+index);
});
assert.throws(()=>new context.GoogleCalendarProviderAdapter_({}).remove({connection:{},externalEventId:'x'}),error=>/cleanup is not configured/.test(error.message));
console.log('VMOS provider cleanup gateway tests passed');
