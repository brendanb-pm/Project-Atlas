function CommandCenterWorkspaceService_(dependencies){
  dependencies=dependencies||{};
  this.followUps=dependencies.followUps;
  this.jobs=dependencies.jobs;
  this.rfqs=dependencies.rfqs;
  this.quotes=dependencies.quotes;
  this.customers=dependencies.customers;
  this.invoices=dependencies.invoices;
  this.purchases=dependencies.purchases;
  this.calendarRequests=dependencies.calendarRequests;
  this.calendarState=dependencies.calendarState||function(){if(typeof getCalendarFollowUpConfig_!=='function')return 'ENABLED';try{var config=getCalendarFollowUpConfig_();if(!config.enabled)return 'DISABLED';return config.provider&&config.calendarId?'ENABLED':'NOT_CONFIGURED';}catch(error){return 'SOURCE_UNAVAILABLE';}};
  this.clock=dependencies.clock||function(){return new Date();};
  this.limit=Number(dependencies.limit||12);
  this.diagnostic=dependencies.diagnostic||function(entry){try{console.warn(JSON.stringify(entry));}catch(ignored){}};
}
CommandCenterWorkspaceService_.prototype.get=function(context){
  var capabilities=(context&&context.capabilities)||[],self=this,sections={},unavailable=[];
  function can(capability){return capabilities.indexOf(capability)!==-1;}
  function read(name,allowed,reader){if(!allowed)return [];try{return reader()||[];}catch(error){unavailable.push({section:name,message:'This section is temporarily unavailable.'});self.diagnostic({event:'COMMAND_CENTER_SOURCE_UNAVAILABLE',correlationId:String(context&&context.correlationId||''),source:name,category:String(error&&error.code||'SOURCE_READ_FAILED')});return [];}}
  var followUps=read('Follow-Ups',can('FOLLOWUP_READ'),function(){return (self.followUps||new FollowUpRepository_()).list();});
  var jobs=read('Jobs',can('OPERATIONS_READ'),function(){return (self.jobs||new MvpService_('Job')).list();});
  var purchases=read('Purchasing',can('PURCHASE_APPROVE')||can('PURCHASE_REQUEST'),function(){return (self.purchases||new PurchaseApprovalService_()).list();});
  var calendarState=this.calendarState(),calendarAllowed=can('CALENDAR_RECONCILE')&&calendarState==='ENABLED',requests=read('Calendar review',calendarAllowed,function(){return (self.calendarRequests||new ExternalChangeRequestRepository_()).list();});
  if(can('CALENDAR_RECONCILE')&&calendarState==='SOURCE_UNAVAILABLE')unavailable.push({section:'Calendar review',message:'This section is temporarily unavailable.'});
  var now=this.clock(),day=this.dayBounds_(now),attention=[];
  followUps.forEach(function(item){var status=String(item.status||'').toUpperCase(),due=item.dueAt?new Date(item.dueAt):null;if(status==='COMPLETED'||status==='CANCELLED'||!due||isNaN(due))return;if(due<day.start)attention.push(self.attention_('FOLLOWUP_OVERDUE','DUE_OVERDUE','Overdue Follow-Up',item.title||item.id,'Due '+self.dateLabel_(due),item.id,'follow-ups','Follow-Up'));});
  jobs.forEach(function(item){var status=String(item.status||'').toUpperCase();if(['BLOCKED','PROBLEM_REPORTED','NEEDS_CLASSIFICATION','UNKNOWN'].indexOf(status)!==-1)attention.push(self.attention_('JOB_'+status,status==='BLOCKED'||status==='PROBLEM_REPORTED'?'CRITICAL_BLOCKING':'ACTION_REQUIRED',status==='PROBLEM_REPORTED'?'Job problem reported':status==='NEEDS_CLASSIFICATION'||status==='UNKNOWN'?'Job needs classification':'Blocked Job',item.id,item.partId||item.customerId||'Open the Job for current context.',item.id,'jobs','Job'));var terminal=['COMPLETE','COMPLETED','CLOSED','CANCELLED','CANCELED'].indexOf(status)!==-1,bucket=!terminal&&item.dueDate&&typeof dailyProductionBucket_==='function'?dailyProductionBucket_(item.dueDate,now,typeof getAtlasBusinessTimeZone_==='function'?getAtlasBusinessTimeZone_():'Etc/UTC'):'';if(bucket==='OVERDUE'||bucket==='DUE_TODAY')attention.push(self.attention_('PRODUCTION_'+bucket,bucket==='OVERDUE'?'CRITICAL_BLOCKING':'ACTION_REQUIRED',bucket==='OVERDUE'?'Overdue Work Order':'Work Order due today',item.id,item.blockerReason||item.currentOperation||item.partId||'Review committed work.',item.id,'daily-production','Work Order'));});
  purchases.forEach(function(item){var status=String(item.status||'').toUpperCase();if(['PENDING','PENDING_APPROVAL','REQUESTED','SUBMITTED'].indexOf(status)!==-1)attention.push(self.attention_('PURCHASE_APPROVAL','ACTION_REQUIRED','Purchase approval required',item.id,item.description||item.vendor||'Review the purchase request.',item.id,'purchasing','Purchase Request'));});
  requests.forEach(function(item){if(String(item.status||'').toUpperCase()==='PENDING_REVIEW')attention.push(self.attention_('CALENDAR_REVIEW','ACTION_REQUIRED','Calendar change needs review',item.followUpId||item.id,String(item.changeType||'External calendar change').replace(/_/g,' '),item.id,'follow-ups','Calendar'));});
  attention.sort(this.compareAttention_).splice(this.limit);
  sections.attention=attention;
  sections.today=followUps.filter(function(item){var status=String(item.status||'').toUpperCase(),due=item.dueAt?new Date(item.dueAt):null;return status!=='COMPLETED'&&status!=='CANCELLED'&&due&&!isNaN(due)&&due>=day.start&&due<day.end;}).sort(function(a,b){return new Date(a.dueAt)-new Date(b.dueAt);}).slice(0,8).map(function(item){return {id:item.id,title:item.title||item.id,context:'Due '+self.timeLabel_(item.dueAt),route:'follow-ups',source:'Follow-Up'};});
  var ownedFollowUps=followUps.filter(function(item){return String(item.ownerUserId||'')===String(context.userId||'')&&['COMPLETED','CANCELLED'].indexOf(String(item.status||'').toUpperCase())===-1;});
  var ownedJobs=jobs.filter(function(item){return String(item.operator||item.ownerUserId||'')===String(context.userId||'')&&['COMPLETED','CANCELLED','CLOSED'].indexOf(String(item.status||'').toUpperCase())===-1;});
  sections.myWork=ownedFollowUps.slice(0,5).map(function(item){return {id:item.id,title:item.title||item.id,context:item.dueAt?'Due '+self.dateLabel_(item.dueAt):'Follow-Up',route:'follow-ups',source:'Follow-Up'};}).concat(ownedJobs.slice(0,5).map(function(item){return {id:item.id,title:item.id,context:item.status||'Current work',route:'jobs',source:'Job'};})).slice(0,8);
  var metricSources=[['Customer','CORE_RECORD_READ',function(){return (self.customers||new MvpService_('Customer')).list();}],['RFQ','RFQ_READ',function(){return (self.rfqs||new MvpService_('RFQ')).list();}],['Quote','RFQ_READ',function(){return (self.quotes||new MvpService_('Quote')).list();}],['Job','OPERATIONS_READ',function(){return jobs;}],['Invoice','FINANCE_READ',function(){return (self.invoices||new MvpService_('Invoice')).list();}]],metrics=[],recent={};
  metricSources.forEach(function(entry){if(!can(entry[1]))return;var rows=read(entry[0]+' reference',true,entry[2]);metrics.push({entity:entry[0],count:rows.length});if(['RFQ','Job','Invoice'].indexOf(entry[0])!==-1)recent[entry[0]]=rows.slice(-5).reverse().map(function(row){return self.reference_(entry[0],row);});});
  return {generatedAt:now,accessState:capabilities.length?'READY':(context&&context.authoritative?'NO_APPLICABLE_CAPABILITIES':'IDENTITY_VALIDATION_REQUIRED'),sourceStates:{calendarReview:can('CALENDAR_RECONCILE')?calendarState:'NOT_AUTHORIZED'},attention:sections.attention,today:sections.today,myWork:sections.myWork,metrics:metrics,recent:recent,unavailable:unavailable,capabilities:{sales:can('SALES_READ')||can('FOLLOWUP_READ'),operations:can('OPERATIONS_READ'),approvals:can('PURCHASE_APPROVE')||can('QUOTE_APPROVE'),finance:can('FINANCE_READ'),admin:can('ADMIN_CONFIG')||can('ADMIN_IDENTITY')}};
};
CommandCenterWorkspaceService_.prototype.dayBounds_=function(value){var start=new Date(value);start.setHours(0,0,0,0);var end=new Date(start);end.setDate(end.getDate()+1);return {start:start,end:end};};
CommandCenterWorkspaceService_.prototype.attention_=function(category,severity,title,summary,context,recordId,route,source){return {id:category+':'+recordId,category:category,severity:severity,title:title,summary:summary,context:context,recordId:recordId,route:route,source:source};};
CommandCenterWorkspaceService_.prototype.compareAttention_=function(a,b){var order={CRITICAL_BLOCKING:0,ACTION_REQUIRED:1,DUE_OVERDUE:2,INFORMATIONAL:3},left=Object.prototype.hasOwnProperty.call(order,a.severity)?order[a.severity]:9,right=Object.prototype.hasOwnProperty.call(order,b.severity)?order[b.severity]:9;return left-right||String(a.id).localeCompare(String(b.id));};
CommandCenterWorkspaceService_.prototype.reference_=function(entity,row){return {id:row.id,status:row.status||'',summary:row.description||row.partId||row.customerId||row.jobId||'Open record',context:row.dueDate||row.invoiceDate||row.updatedAt||''};};
CommandCenterWorkspaceService_.prototype.dateLabel_=function(value){return new Date(value).toLocaleDateString();};
CommandCenterWorkspaceService_.prototype.timeLabel_=function(value){return new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});};
