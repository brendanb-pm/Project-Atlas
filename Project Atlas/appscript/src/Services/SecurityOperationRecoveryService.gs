function SecurityOperationRecoveryService_(dependencies){
  dependencies=dependencies||{};
  this.securityEvents=dependencies.securityEvents||new SecurityAuditEventRepository_();
  this.followUps=dependencies.followUps||new FollowUpRepository_();
  this.followUpEvents=dependencies.followUpEvents||new FollowUpEventRepository_();
  this.ideas=dependencies.ideas||(typeof IdeasRepository_!=='undefined'?new IdeasRepository_():null);
  this.ideaEvents=dependencies.ideaEvents||(typeof IdeaEventRepository_!=='undefined'?new IdeaEventRepository_():null);
  this.jobs=dependencies.jobs||new MvpService_('Job');
  this.jobEvents=dependencies.jobEvents||new JobEventRepository_();
  this.ledger=dependencies.ledger||new SecurityAuditService_({repository:this.securityEvents});
  this.clock=dependencies.clock||function(){return new Date();};
  this.lock=dependencies.lock||(typeof LockService!=='undefined'?LockService.getScriptLock():null);
}

SecurityOperationRecoveryService_.prototype.recover=function(eventId,recoveryContext){return this.reconcile(eventId,recoveryContext);};

SecurityOperationRecoveryService_.prototype.reconcile=function(eventId,recoveryContext){
  recoveryContext=recoveryContext||{};
  var record=this.securityEvents.get(eventId);
  if(recoveryContext.tenantId&&String(record.tenantId)!==String(recoveryContext.tenantId))throw new VmosAuthorizationError_('Recovery operation is unavailable.');
  if(String(record.status).toUpperCase()==='COMPLETED')return {outcome:'COMPLETED',record:record};
  var claimed=this.claim_(record,recoveryContext),claimStatus=String(claimed.status||'').toUpperCase();
  if(claimStatus==='COMPLETED')return {outcome:'COMPLETED',record:claimed};
  if(claimStatus!=='RECONCILING')return {outcome:'ACTIVE',record:claimed};
  try{
    var probe=this.probe_(claimed);
    if(probe.outcome!=='COMPLETED'){
      var uncertain=this.ledger.markRecoveryRequired(claimed,'STALE_OUTCOME_UNCERTAIN',recoveryContext.actor,recoveryContext.correlationId);
      return {outcome:'UNCERTAIN',record:uncertain};
    }
    var result=this.recoverRecord_(claimed,recoveryContext),completed=this.ledger.markRecovered(claimed,result,recoveryContext);
    return {outcome:'COMPLETED',record:completed,result:result};
  }catch(error){
    this.ledger.markRecoveryFailed(claimed,error,recoveryContext);
    throw error;
  }
};

SecurityOperationRecoveryService_.prototype.claim_=function(record,recoveryContext){return this.withLock_(function(){
  var current=this.securityEvents.get(record.id),status=String(current.status||'').toUpperCase();
  if(status==='COMPLETED'||status==='RECONCILING')return current;
  if(status==='IN_PROGRESS'&&!this.isLeaseExpired_(current))return current;
  if(['IN_PROGRESS','PENDING','RECOVERY_REQUIRED'].indexOf(status)===-1)throw new VmosConfigurationError_('Security operation is not recoverable.');
  return this.securityEvents.update(current.id,{status:'RECONCILING',recoveryStatus:'IN_PROGRESS',recoveryActor:String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'),recoveryCorrelationId:String(recoveryContext.correlationId||''),reconciledAt:this.clock(),lastAttemptAt:this.clock(),attemptCount:Number(current.attemptCount||1)+1});
}.bind(this));};

SecurityOperationRecoveryService_.prototype.probe_=function(record){
  if(String(record.mutationState||'').toUpperCase()==='CANONICAL_COMPLETED')return {outcome:'COMPLETED'};
  if(record.recoveryType==='FOLLOW_UP_DOMAIN_EVENT')return this.probeFollowUp_(record);
  if(record.recoveryType==='IDEA_DOMAIN_EVENT')return this.probeIdea_(record);
  if(record.recoveryType==='SHOP_FLOOR_DOMAIN_EVENT')return this.probeShopFloor_(record);
  return {outcome:'UNCERTAIN'};
};

SecurityOperationRecoveryService_.prototype.probeFollowUp_=function(record){
  if(!record.resourceId)return {outcome:'UNCERTAIN'};
  var existing=this.followUpEvents.findByCorrelation(record.resourceId,record.correlationId);
  if(existing)return {outcome:'COMPLETED'};
  var followUp;try{followUp=this.followUps.get(record.resourceId);}catch(error){if(error&&error.code==='NOT_FOUND')return {outcome:'UNCERTAIN'};throw error;}
  var context=this.context_(record),expected=Number(context.expectedVersion||0),type=context.eventType||this.eventTypeFor_(record.operation);
  if(type==='CREATED'&&Number(followUp.version)===1)return {outcome:'COMPLETED'};
  if(type==='COMPLETED'&&followUp.status==='COMPLETED'&&Number(followUp.version)>expected)return {outcome:'COMPLETED'};
  if(type==='CANCELLED'&&followUp.status==='CANCELLED'&&Number(followUp.version)>expected)return {outcome:'COMPLETED'};
  if(type==='REASSIGNED'&&String(followUp.ownerUserId)===String(context.newOwner||'')&&Number(followUp.version)>expected)return {outcome:'COMPLETED'};
  if(type==='RESCHEDULED'&&context.dueAt&&Number(followUp.version)===expected+1&&new Date(followUp.dueAt).getTime()===new Date(context.dueAt).getTime())return {outcome:'COMPLETED'};
  return {outcome:'UNCERTAIN'};
};

SecurityOperationRecoveryService_.prototype.probeIdea_=function(record){
  if(!record.resourceId)return {outcome:'UNCERTAIN'};
  var eventId='IDEA-EVT-'+String(record.correlationId||'').toUpperCase(),events=this.ideaEvents.listByIdeaId(record.resourceId);
  if(events.some(function(event){return String(event.id)===eventId;}))return {outcome:'COMPLETED'};
  try{this.ideas.findById(record.resourceId);}catch(error){if(error&&error.code==='NOT_FOUND')return {outcome:'UNCERTAIN'};throw error;}
  return record.operation==='captureIdea'?{outcome:'COMPLETED'}:{outcome:'UNCERTAIN'};
};

SecurityOperationRecoveryService_.prototype.probeShopFloor_=function(record){
  if(!record.resourceId)return {outcome:'UNCERTAIN'};
  var context=this.context_(record),commandId=context.commandId||record.idempotencyKey;
  if(this.jobEvents.listByJobId(record.resourceId).some(function(event){return String(event.commandId)===String(commandId);}))return {outcome:'COMPLETED'};
  this.jobs.get(record.resourceId);
  return {outcome:'UNCERTAIN'};
};

SecurityOperationRecoveryService_.prototype.recoverRecord_=function(record,recoveryContext){
  if(record.recoveryType==='FOLLOW_UP_DOMAIN_EVENT')return this.recoverFollowUpEvent_(record,recoveryContext);
  if(record.recoveryType==='IDEA_DOMAIN_EVENT')return this.recoverIdeaEvent_(record,recoveryContext);
  if(record.recoveryType==='SHOP_FLOOR_DOMAIN_EVENT')return this.recoverShopFloorEvent_(record,recoveryContext);
  throw new VmosConfigurationError_('No recovery handler is registered for this operation.');
};

SecurityOperationRecoveryService_.prototype.recoverFollowUpEvent_=function(record,recoveryContext){return this.withLock_(function(){
  var existing=this.followUpEvents.findByCorrelation(record.resourceId,record.correlationId),followUp=this.followUps.get(record.resourceId);
  if(existing)return followUp;
  var context=this.context_(record),eventType=context.eventType||this.eventTypeFor_(record.operation),previous=Number(context.expectedVersion||Math.max(0,Number(followUp.version||1)-1));
  this.followUpEvents.append({id:'FUE-RECOVERY-'+record.id,followUpId:followUp.id,eventType:eventType,occurredAt:record.mutationAt||record.occurredAt||this.clock(),actor:record.userId,correlationId:record.correlationId,previousVersion:previous,newVersion:previous+1,details:JSON.stringify({recoveredFromSecurityOperation:record.id,recoveredBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY',context:context})});
  return followUp;
}.bind(this));};

SecurityOperationRecoveryService_.prototype.recoverIdeaEvent_=function(record,recoveryContext){return this.withLock_(function(){
  var idea=this.ideas.findById(record.resourceId),eventId='IDEA-EVT-'+String(record.correlationId||'').toUpperCase(),existing=this.ideaEvents.listByIdeaId(record.resourceId).filter(function(event){return String(event.id)===eventId;})[0];
  if(existing)return idea;
  var context=this.context_(record);
  this.ideaEvents.append({id:eventId,ideaId:idea.id,eventType:context.eventType||'IDEA_CAPTURED',occurredAt:record.occurredAt||this.clock(),actor:record.userId,note:(context.note||'Idea event recovered.')+' [Recovered by '+String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY')+']'});
  return idea;
}.bind(this));};

SecurityOperationRecoveryService_.prototype.eventTypeFor_=function(operation){return {createFollowUp:'CREATED',completeFollowUp:'COMPLETED',cancelFollowUp:'CANCELLED',scheduleFollowUp:'SCHEDULED',rescheduleFollowUp:'RESCHEDULED',reassignFollowUp:'REASSIGNED'}[operation]||'';};

SecurityOperationRecoveryService_.prototype.recoverShopFloorEvent_=function(record,recoveryContext){return this.withLock_(function(){
  var context=this.context_(record),commandId=context.commandId||record.idempotencyKey,existing=this.jobEvents.listByJobId(record.resourceId).filter(function(event){return String(event.commandId)===String(commandId);})[0],job=this.jobs.get(record.resourceId);
  if(existing)return job;
  this.jobEvents.append({id:'EVT-RECOVERY-'+record.id,jobId:job.id,eventType:context.eventType||'RECOVERED_OPERATION',occurredAt:record.occurredAt||this.clock(),actor:record.userId,previousStatus:'',newStatus:job.status||context.targetStatus||'',notes:'Recovered append-only audit event by '+String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY')+'.',workflowId:'',workflowVersion:'1',commandId:commandId});
  return job;
}.bind(this));};

SecurityOperationRecoveryService_.prototype.context_=function(record){try{return JSON.parse(record.recoveryJson||'{}');}catch(ignored){return {};}};
SecurityOperationRecoveryService_.prototype.isLeaseExpired_=function(record){var seconds=Number(record.leaseSeconds||120),expires=record.leaseExpiresAt||new Date(new Date(record.lastAttemptAt||record.occurredAt||0).getTime()+seconds*1000);return new Date(expires).getTime()<=new Date(this.clock()).getTime();};
SecurityOperationRecoveryService_.prototype.withLock_=function(operation){if(!this.lock)return operation();this.lock.waitLock(10000);try{return operation();}finally{this.lock.releaseLock();}};
