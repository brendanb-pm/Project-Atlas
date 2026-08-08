'use strict';

const {performance}=require('perf_hooks');

const TIERS={
  SMALL:{customers:100,salesActivities:1200,followUps:300,rfqs:250,quotes:350,jobs:200,jobEvents:3000,documents:800,processTrials:300,purchases:400,receipts:600,calendarLinks:150,calendarSyncEvents:1000},
  MEDIUM:{customers:1000,salesActivities:15000,followUps:4000,rfqs:3000,quotes:4500,jobs:2500,jobEvents:50000,documents:8000,processTrials:5000,purchases:5000,receipts:8000,calendarLinks:2000,calendarSyncEvents:20000},
  HEAVY:{customers:3000,salesActivities:60000,followUps:15000,rfqs:10000,quotes:16000,jobs:8000,jobEvents:200000,documents:30000,processTrials:20000,purchases:20000,receipts:30000,calendarLinks:7500,calendarSyncEvents:80000},
  STRESS:{customers:10000,salesActivities:250000,followUps:60000,rfqs:40000,quotes:65000,jobs:30000,jobEvents:1000000,documents:120000,processTrials:80000,purchases:80000,receipts:120000,calendarLinks:30000,calendarSyncEvents:350000}
};

function id(prefix,index){return prefix+'-'+String(index+1).padStart(7,'0');}
function make(count,factory){return Array.from({length:count},(_,index)=>factory(index));}
function generate(tierName){
  const size=TIERS[tierName];if(!size)throw new Error('Unknown tier '+tierName);
  const customers=make(size.customers,i=>({id:id('CUST',i),name:'Synthetic Customer '+i,status:i%11?'OPEN':'INACTIVE'}));
  const salesActivities=make(size.salesActivities,i=>({id:id('SACT',i),customerId:customers[i%customers.length].id,activityDatetime:new Date(Date.UTC(2026,7,1-(i%900))).toISOString(),status:i%7?'OPEN':'CLOSED_WON',nextActionDueAt:new Date(Date.UTC(2026,7,1+(i%45))).toISOString(),summary:'Synthetic activity '+i}));
  const followUps=make(size.followUps,i=>({id:id('FUP',i),customerId:customers[i%customers.length].id,dueAt:new Date(Date.UTC(2026,7,1+(i%60)-20)).toISOString(),startAt:i%3?new Date(Date.UTC(2026,7,1+(i%30),9+(i%8))).toISOString():'',status:i%9?'OPEN':'COMPLETED',ownerUserId:'USER-'+(i%12)}));
  const rfqs=make(size.rfqs,i=>({id:id('RFQ',i),customerId:customers[i%customers.length].id,subject:'Synthetic RFQ '+i,status:i%5?'OPEN':'CLOSED'}));
  const quotes=make(size.quotes,i=>({id:id('QUOTE',i),rfqId:rfqs[i%rfqs.length].id,customerId:customers[i%customers.length].id,total:(i%10000)+500,status:i%6?'DRAFT':'ISSUED'}));
  const jobs=make(size.jobs,i=>({id:id('JOB',i),quoteId:quotes[i%quotes.length].id,customerId:customers[i%customers.length].id,status:['QUEUED','RUNNING','BLOCKED','COMPLETE'][i%4],operator:'USER-'+(i%12),dueDate:new Date(Date.UTC(2026,7,1+(i%90)-30)).toISOString()}));
  const jobEvents=make(size.jobEvents,i=>({id:id('JEV',i),jobId:jobs[i%jobs.length].id,eventType:['RECEIVED','STATUS_CHANGED','NOTE','PROBLEM'][i%4],occurredAt:new Date(Date.UTC(2026,7,1-(i%1200))).toISOString(),details:'Synthetic event '+i}));
  const documents=make(size.documents,i=>({id:id('DOC',i),customerId:customers[i%customers.length].id,rfqId:rfqs[i%rfqs.length].id,jobId:jobs[i%jobs.length].id,name:'Synthetic document '+i}));
  const processTrials=make(size.processTrials,i=>({id:id('PTR',i),jobId:jobs[i%jobs.length].id,partId:'PART-'+(i%Math.max(1,Math.ceil(size.jobs/2))),result:i%4?'ACCEPTED':'REVIEW'}));
  const purchases=make(size.purchases,i=>({id:id('PUR',i),jobId:jobs[i%jobs.length].id,status:i%5?'APPROVED':'PENDING',amount:(i%5000)+20}));
  const receipts=make(size.receipts,i=>({id:id('RCT',i),customerId:customers[i%customers.length].id,invoiceId:'INV-'+(i%Math.max(1,size.jobs)),amount:(i%3000)+50,deposited:i%3!==0}));
  const calendarLinks=make(size.calendarLinks,i=>({id:id('LINK',i),followUpId:followUps[i%followUps.length].id,provider:['GOOGLE_CALENDAR','MICROSOFT_GRAPH_CALENDAR','APPLE_ICLOUD_CALENDAR'][i%3],externalEventId:'EXT-'+i}));
  const calendarSyncEvents=make(size.calendarSyncEvents,i=>({id:id('CSE',i),followUpId:followUps[i%followUps.length].id,provider:calendarLinks[i%calendarLinks.length].provider,correlationId:'CORR-'+i,result:i%17?'APPLIED':'FAILED',occurredAt:new Date(Date.UTC(2026,7,1-(i%365))).toISOString()}));
  return {tier:tierName,counts:{...size},customers,salesActivities,followUps,rfqs,quotes,jobs,jobEvents,documents,processTrials,purchases,receipts,calendarLinks,calendarSyncEvents};
}

function measuredStore(rows){
  const metrics={reads:0,writes:0,rowsExamined:0};
  return {metrics,reset(){metrics.reads=metrics.writes=metrics.rowsExamined=0},list(){metrics.reads++;metrics.rowsExamined+=rows.length;return rows.slice()},findById(value){metrics.reads++;for(let i=0;i<rows.length;i++){metrics.rowsExamined++;if(rows[i].id===value)return rows[i]}},findBy(fields){metrics.reads++;for(let i=0;i<rows.length;i++){metrics.rowsExamined++;if(Object.keys(fields).every(key=>rows[i][key]===fields[key]))return rows[i]}},append(row){metrics.writes++;rows.push(row);return row}};
}
function stores(data){const result={};Object.keys(data).forEach(key=>{if(Array.isArray(data[key]))result[key]=measuredStore(data[key])});return result;}
function summarize(stores){return Object.values(stores).reduce((m,store)=>({reads:m.reads+store.metrics.reads,writes:m.writes+store.metrics.writes,rowsExamined:m.rowsExamined+store.metrics.rowsExamined}),{reads:0,writes:0,rowsExamined:0});}
function reset(stores){Object.values(stores).forEach(store=>store.reset())}
function measure(name,allStores,operation){
  reset(allStores);
  const operationStart=performance.now();
  const result=operation();
  const operationDurationMs=performance.now()-operationStart;
  const serializationStart=performance.now();
  const serialized=JSON.stringify(result);
  const serializationDurationMs=performance.now()-serializationStart;
  return {
    scenario:name,
    durationMs:Number(operationDurationMs.toFixed(3)),
    operationDurationMs:Number(operationDurationMs.toFixed(3)),
    serializationDurationMs:Number(serializationDurationMs.toFixed(3)),
    totalMeasuredMs:Number((operationDurationMs+serializationDurationMs).toFixed(3)),
    ...summarize(allStores),
    payloadBytes:Buffer.byteLength(serialized),
    resultCount:Array.isArray(result)?result.length:1
  };
}

function scenarios(data){
  const s=stores(data),customer=data.customers[Math.floor(data.customers.length/2)],rfq=data.rfqs[Math.floor(data.rfqs.length/2)],job=data.jobs[Math.floor(data.jobs.length/2)],correlation='CORR-'+Math.floor(data.calendarSyncEvents.length/2);
  return [
    measure('CRM customer and timeline',s,()=>({customer:s.customers.findById(customer.id),activities:s.salesActivities.list().filter(row=>row.customerId===customer.id).sort((a,b)=>b.activityDatetime.localeCompare(a.activityDatetime))})),
    measure('CRM follow-up queue',s,()=>s.followUps.list().filter(row=>row.status==='OPEN'&&row.dueAt<='2026-08-08T23:59:59.999Z')),
    measure('CRM search/filter',s,()=>s.customers.list().filter(row=>row.name.includes('42'))),
    measure('RFQ list/search',s,()=>s.rfqs.list().filter(row=>row.status==='OPEN'&&row.subject.includes('2'))),
    measure('RFQ open and quote preparation',s,()=>({rfq:s.rfqs.findById(rfq.id),quotes:s.quotes.list().filter(row=>row.rfqId===rfq.id),documents:s.documents.list().filter(row=>row.rfqId===rfq.id)})),
    measure('Job list',s,()=>s.jobs.list().filter(row=>row.status!=='COMPLETE')),
    measure('Job detail and history',s,()=>({job:s.jobs.findById(job.id),events:s.jobEvents.list().filter(row=>row.jobId===job.id),documents:s.documents.list().filter(row=>row.jobId===job.id),trials:s.processTrials.list().filter(row=>row.jobId===job.id)})),
    measure('Command Center aggregation',s,()=>({jobs:s.jobs.list().filter(row=>row.status!=='COMPLETE').length,overdue:s.followUps.list().filter(row=>row.status==='OPEN'&&row.dueAt<'2026-08-08').length,purchases:s.purchases.list().filter(row=>row.status==='PENDING').length,receipts:s.receipts.list().filter(row=>!row.deposited).length})),
    measure('Shop-floor status update',s,()=>{const current=s.jobs.findById(job.id);s.jobEvents.append({id:'JEV-NEW',jobId:job.id,eventType:'STATUS_CHANGED'});return current}),
    measure('Floor board ten refreshes',s,()=>{let last=[];for(let i=0;i<10;i++){const recent={};s.jobEvents.list().forEach(event=>{recent[event.jobId]=event});last=s.jobs.list().filter(row=>row.status!=='COMPLETE').map(row=>({id:row.id,status:row.status,lastEvent:recent[row.id]&&recent[row.id].eventType}))}return last}),
    measure('Calendar FollowUps and Today',s,()=>({followUps:s.followUps.list(),links:s.calendarLinks.list(),today:s.followUps.list().filter(row=>row.startAt&&row.status==='OPEN').slice(0,100)})),
    measure('Calendar correlation lookup',s,()=>s.calendarSyncEvents.findBy({provider:data.calendarSyncEvents[Math.floor(data.calendarSyncEvents.length/2)].provider,correlationId:correlation})),
    measure('Calendar sync persistence',s,()=>s.calendarSyncEvents.append({id:'CSE-NEW',provider:'GOOGLE_CALENDAR',followUpId:data.followUps[0].id,correlationId:'CORR-NEW',result:'APPLIED'}))
  ];
}
function run(tiers){return tiers.map(name=>{const generated=generate(name);return {tier:name,counts:generated.counts,measurements:scenarios(generated)}})}
if(require.main===module){const tiers=process.argv.includes('--stress')?['SMALL','MEDIUM','HEAVY','STRESS']:['SMALL','MEDIUM','HEAVY'];process.stdout.write(JSON.stringify({generatedAt:new Date().toISOString(),runtime:process.version,tiers:run(tiers)},null,2)+'\n')}
module.exports={TIERS,generate,measuredStore,scenarios,run};
