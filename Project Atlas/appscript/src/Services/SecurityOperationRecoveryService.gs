function SecurityOperationRecoveryService_(dependencies){
  dependencies=dependencies||{};
  this.securityEvents=dependencies.securityEvents||new SecurityAuditEventRepository_();
  this.followUps=dependencies.followUps||new FollowUpRepository_();
  this.followUpEvents=dependencies.followUpEvents||new FollowUpEventRepository_();
  this.ideas=dependencies.ideas||(typeof IdeasRepository_!=='undefined'?new IdeasRepository_():null);
  this.ideaEvents=dependencies.ideaEvents||(typeof IdeaEventRepository_!=='undefined'?new IdeaEventRepository_():null);
  this.jobs=dependencies.jobs||new MvpService_('Job');
  this.jobEvents=dependencies.jobEvents||new JobEventRepository_();
  this.qrTokens=dependencies.qrTokens||(typeof JobQrTokenRepository_!=='undefined'?new JobQrTokenRepository_():null);
  this.salesActivities=dependencies.salesActivities||(typeof SalesActivityRepository_!=='undefined'?new SalesActivityRepository_():null);
  this.processTrials=dependencies.processTrials||(typeof ProcessTrialRepository_!=='undefined'?new ProcessTrialRepository_():null);
  this.cashReceipts=dependencies.cashReceipts||(typeof CashReceiptRepository_!=='undefined'?new CashReceiptRepository_():null);
  this.purchases=dependencies.purchases||(typeof PurchaseApprovalRepository_!=='undefined'?new PurchaseApprovalRepository_():null);
  this.vendors=dependencies.vendors||(typeof VendorRepository_!=='undefined'?new VendorRepository_():null);
  this.quoteCostEstimates=dependencies.quoteCostEstimates||(typeof QuoteCostEstimateRepository_!=='undefined'?new QuoteCostEstimateRepository_():null);
  this.quoteCostLines=dependencies.quoteCostLines||(typeof QuoteCostLineRepository_!=='undefined'?new QuoteCostLineRepository_():null);
  this.quotePricing=dependencies.quotePricing||(typeof QuotePricingDecisionRepository_!=='undefined'?new QuotePricingDecisionRepository_():null);
  this.quoteRevisions=dependencies.quoteRevisions||(typeof QuoteRevisionRepository_!=='undefined'?new QuoteRevisionRepository_():null);
  this.quoteLines=dependencies.quoteLines||(typeof QuoteLineItemRepository_!=='undefined'?new QuoteLineItemRepository_():null);
  this.quoteMutationCheckpoints=dependencies.quoteMutationCheckpoints||(typeof QuoteMutationCheckpointRepository_!=='undefined'?new QuoteMutationCheckpointRepository_():null);
  this.quoteSourceLinks=dependencies.quoteSourceLinks||(typeof QuoteSourceDocumentLinkRepository_!=='undefined'?new QuoteSourceDocumentLinkRepository_():null);
  this.mvpFactory=dependencies.mvpFactory||function(type){return new MvpService_(type);};
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
    if(probe.outcome==='NOT_COMPLETED')return {outcome:'NOT_COMPLETED',proof:true,record:claimed};
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
  if(record.recoveryType==='SHOP_FLOOR_DOMAIN_EVENT'&&record.operation==='configureShopFloorJob')return this.probeShopFloor_(record);
  if(String(record.mutationState||'').toUpperCase()==='CANONICAL_COMPLETED')return {outcome:'COMPLETED'};
  if(record.recoveryType==='FOLLOW_UP_DOMAIN_EVENT')return this.probeFollowUp_(record);
  if(record.recoveryType==='IDEA_DOMAIN_EVENT')return this.probeIdea_(record);
  if(record.recoveryType==='SHOP_FLOOR_DOMAIN_EVENT')return this.probeShopFloor_(record);
  if(record.recoveryType==='QUOTE_REVISION_AGGREGATE')return this.probeQuoteAggregate_(record,false);
  if(record.recoveryType==='QUOTE_COST_AGGREGATE')return this.probeQuoteAggregate_(record,true);
  if(record.recoveryType==='QUOTE_LIFECYCLE')return this.probeQuoteLifecycle_(record);
  if(record.recoveryType==='UNIVERSAL_RESOURCE_PROOF')return this.probeUniversal_(record);
  return {outcome:'UNCERTAIN'};
};

SecurityOperationRecoveryService_.prototype.probeUniversal_=function(record){
  var context=this.context_(record),strategy=context.strategy||'';
  if(strategy==='EXPLICIT_REVIEW')return {outcome:'UNCERTAIN'};
  if(strategy==='COMMAND_IDEMPOTENCY_KEY_LOOKUP')return this.probeCommand_(record,context);
  if(strategy==='PREALLOCATED_RESOURCE_ID')return this.probePreallocated_(record);
  if(strategy==='VERSIONED_EXISTING_RESOURCE_CHECKPOINT')return this.probeState_(record,context);
  return {outcome:'UNCERTAIN'};
};
SecurityOperationRecoveryService_.prototype.probePreallocated_=function(record){if(!record.resourceId)return {outcome:'UNCERTAIN'};try{var resource=this.resource_(record);return this.matchesOperationProof_(record,resource)?{outcome:'COMPLETED'}:{outcome:'UNCERTAIN'};}catch(error){if(error&&error.code==='NOT_FOUND')return {outcome:'NOT_COMPLETED'};throw error;}};
SecurityOperationRecoveryService_.prototype.probeCommand_=function(record,context){
  if(record.resourceType==='CashReceipt'&&this.cashReceipts){var found=context.receiptCommandId?this.cashReceipts.findByReceiptCommandId(context.receiptCommandId):record.resourceId?this.cashReceipts.findById(record.resourceId):null;if(found){if(!this.matchesOperationProof_(record,found))return {outcome:'UNCERTAIN'};record.resourceId=found.id;return {outcome:'COMPLETED'};}return {outcome:'NOT_COMPLETED'};}
  return {outcome:'UNCERTAIN'};
};
SecurityOperationRecoveryService_.prototype.probeState_=function(record,context){
  var resource;try{resource=this.resource_(record);}catch(error){if(error&&error.code==='NOT_FOUND')return {outcome:'NOT_COMPLETED'};throw error;}
  if(!this.matchesOperationProof_(record,resource))return {outcome:'UNCERTAIN'};
  var expected=context.expectedState||{};
  if(!Object.keys(expected).length)return {outcome:'UNCERTAIN'};
  return Object.keys(expected).every(function(key){return String(resource[key]===undefined?'':resource[key])===String(expected[key]===undefined?'':expected[key]);})?{outcome:'COMPLETED'}:{outcome:'UNCERTAIN'};
};
SecurityOperationRecoveryService_.prototype.matchesOperationProof_=function(record,resource){return !!resource&&String(resource.securityOperationId||'')===String(record.id||'')&&String(resource.securityOperationFingerprint||'')===String(record.requestFingerprint||'')&&String(resource.securityTenantId||resource.tenantId||'')===String(record.tenantId||'')&&String(resource.securityActorId||'')===String(record.userId||'');};
SecurityOperationRecoveryService_.prototype.probeQuoteAggregate_=function(record,isCost){var repo=isCost?this.quoteCostEstimates:this.quoteRevisions,row;try{row=repo.get(record.resourceId);}catch(error){if(error&&error.code==='NOT_FOUND')return {outcome:'NOT_COMPLETED'};throw error;}return this.matchesOperationProof_(record,row)?{outcome:'COMPLETED'}:{outcome:'UNCERTAIN'};};
SecurityOperationRecoveryService_.prototype.probeQuoteLifecycle_=function(record){var row;try{row=this.quoteRevisions.get(record.resourceId);}catch(error){if(error&&error.code==='NOT_FOUND')return {outcome:'NOT_COMPLETED'};throw error;}if(String(row.tenantId)!==String(record.tenantId))return {outcome:'UNCERTAIN'};var context=this.context_(record),action=context.action,status=String(row.status||''),proof=String(row.lastLifecycleOperationId||'')===String(record.id)&&String(row.lastLifecycleFingerprint||'')===String(record.requestFingerprint)&&String(row.lastLifecycleOperation||'')===String(action);if(action==='ISSUE'&&['ISSUED','ACCEPTED','SUPERSEDED'].indexOf(status)!==-1&&String(row.issuedBy||'')===String(record.userId)&&proof)return {outcome:'COMPLETED'};if(action==='ACCEPT'&&status==='ACCEPTED'&&String(row.acceptedBy||'')===String(record.userId)&&proof)return {outcome:'COMPLETED'};if(Number(row.version)===Number(context.expectedVersion)&&((action==='ISSUE'&&status==='DRAFT')||(action==='ACCEPT'&&status==='ISSUED')))return {outcome:'NOT_COMPLETED'};return {outcome:'UNCERTAIN'};};
SecurityOperationRecoveryService_.prototype.resource_=function(record){
  var type=String(record.resourceType||''),id=record.resourceId;if(!id)throw new VmosError_('Recovery resource is unavailable.','NOT_FOUND');
  if(['Customer','RFQ','Quote','Job','Invoice'].indexOf(type)!==-1)return this.mvpFactory(type).get(id);
  if(type==='SalesActivity'&&this.salesActivities)return this.salesActivities.get(id);
  if(type==='ProcessTrial'&&this.processTrials)return this.processTrials.findById(id);
  if(type==='CashReceipt'&&this.cashReceipts)return this.cashReceipts.findById(id);
  if(type==='PurchaseRequest'&&this.purchases)return this.purchases.findById(id);
  if(type==='Vendor'&&this.vendors)return this.vendors.get(id);
  if(type==='QuoteCostEstimate'&&this.quoteCostEstimates)return this.quoteCostEstimates.get(id);
  if(type==='QuoteRevision'&&this.quoteRevisions)return this.quoteRevisions.get(id);
  if(type==='QuoteSourceDocumentLink'&&this.quoteSourceLinks)return this.quoteSourceLinks.get(id);
  throw new VmosError_('Recovery resource is unavailable.','NOT_FOUND');
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
  if(record.operation==='configureShopFloorJob')return this.probeShopFloorConfiguration_(record,context);
  if(this.jobEvents.listByJobId(record.resourceId).some(function(event){return String(event.commandId)===String(commandId);}))return {outcome:'COMPLETED'};
  this.jobs.get(record.resourceId);
  return {outcome:'UNCERTAIN'};
};

SecurityOperationRecoveryService_.prototype.probeShopFloorConfiguration_=function(record,context){
  if(!this.qrTokens||!context.workflowId||!context.qrTokenFingerprint||!Array.isArray(context.eventTypes))return {outcome:'UNCERTAIN'};
  var allowed=['WORKFLOW_ASSIGNED','QR_ASSIGNED'];
  if(context.eventTypes.indexOf('QR_ASSIGNED')===-1||context.eventTypes.some(function(type,index,values){return allowed.indexOf(type)===-1||values.indexOf(type)!==index;}))return {outcome:'UNCERTAIN'};
  var job=this.jobs.get(record.resourceId),tokens=this.qrTokens.listByJobId?this.qrTokens.listByJobId(record.resourceId):this.qrTokens.list().filter(function(item){return String(item.jobId)===String(record.resourceId);});
  var token=tokens.filter(function(item){return String(item.workflowId)===String(context.workflowId)&&shopFloorTokenFingerprint_(item.id)===String(context.qrTokenFingerprint);})[0];
  if(!token)return {outcome:'UNCERTAIN'};
  if(context.eventTypes.indexOf('WORKFLOW_ASSIGNED')!==-1&&String(job.status)!==String(context.assignedStatus))return {outcome:'UNCERTAIN'};
  return {outcome:'COMPLETED'};
};

SecurityOperationRecoveryService_.prototype.recoverRecord_=function(record,recoveryContext){
  if(record.recoveryType==='FOLLOW_UP_DOMAIN_EVENT')return this.recoverFollowUpEvent_(record,recoveryContext);
  if(record.recoveryType==='IDEA_DOMAIN_EVENT')return this.recoverIdeaEvent_(record,recoveryContext);
  if(record.recoveryType==='SHOP_FLOOR_DOMAIN_EVENT')return this.recoverShopFloorEvent_(record,recoveryContext);
  if(record.recoveryType==='QUOTE_REVISION_AGGREGATE')return this.recoverQuoteRevisionAggregate_(record,recoveryContext);
  if(record.recoveryType==='QUOTE_COST_AGGREGATE')return this.recoverQuoteCostAggregate_(record,recoveryContext);
  if(record.recoveryType==='QUOTE_LIFECYCLE')return this.recoverQuoteLifecycle_(record,recoveryContext);
  if(record.recoveryType==='UNIVERSAL_RESOURCE_PROOF')return this.resource_(record);
  throw new VmosConfigurationError_('No recovery handler is registered for this operation.');
};

SecurityOperationRecoveryService_.prototype.checkpointPayloads_=function(record,aggregateType){if(!this.quoteMutationCheckpoints)throw new VmosError_('Quote aggregate checkpoints are unavailable.','CONFLICT');return this.quoteMutationCheckpoints.byField(record.tenantId,'operationId',record.id,200).filter(function(item){return String(item.aggregateType)===aggregateType&&String(item.aggregateId)===String(record.resourceId);}).map(function(item){var payload=JSON.parse(item.payloadJson||'{}');payload.__checkpointId=item.id;payload.__resourceType=item.resourceType;return payload;});};
SecurityOperationRecoveryService_.prototype.recoverQuoteRevisionAggregate_=function(record,recoveryContext){return this.withLock_(function(){var revision=this.quoteRevisions.get(record.resourceId),context=this.context_(record),self=this,lines=this.checkpointPayloads_(record,'QUOTE_REVISION_AGGREGATE'),intended={};if(!this.matchesOperationProof_(record,revision)||String(revision.quoteId)!==String(context.quoteId)||!lines.length)throw new VmosError_('Quote revision recovery proof is unavailable.','CONFLICT');lines.forEach(function(line){if(String(line.tenantId)!==String(record.tenantId)||String(line.quoteRevisionId)!==String(revision.id)||String(line.securityOperationId)!==String(record.id)||line.__resourceType!=='QuoteLineItem')throw new VmosError_('Quote revision recovery context is invalid.','CONFLICT');var checkpointId=line.__checkpointId;delete line.__checkpointId;delete line.__resourceType;intended[line.id]=true;var existing=self.quoteLines.get(line.id);if(existing){if(String(existing.tenantId)!==String(record.tenantId)||String(existing.quoteRevisionId)!==String(revision.id))throw new VmosError_('Quote line belongs to another aggregate.','CONFLICT');self.quoteLines.update(line.id,line);}else self.quoteLines.create(line);self.quoteMutationCheckpoints.update(checkpointId,{status:'COMPLETED',completedAt:self.clock(),completedBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'});});this.quoteLines.byField(record.tenantId,'quoteRevisionId',revision.id,200).forEach(function(line){if(!intended[line.id]&&String(line.status||'ACTIVE')!=='REPLACED')self.quoteLines.update(line.id,{status:'REPLACED',updatedAt:self.clock(),updatedBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'});});return {revision:revision,lines:this.quoteLines.byField(record.tenantId,'quoteRevisionId',revision.id,100),recoveredBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'};}.bind(this));};
SecurityOperationRecoveryService_.prototype.recoverQuoteCostAggregate_=function(record,recoveryContext){return this.withLock_(function(){var estimate=this.quoteCostEstimates.get(record.resourceId),context=this.context_(record),self=this,items=this.checkpointPayloads_(record,'QUOTE_COST_AGGREGATE'),intended={};if(!this.matchesOperationProof_(record,estimate)||String(estimate.quoteId)!==String(context.quoteId)||String(estimate.quoteRevisionId)!==String(context.quoteRevisionId)||!items.length)throw new VmosError_('Quote costing recovery proof is unavailable.','CONFLICT');items.forEach(function(item){if(String(item.tenantId)!==String(record.tenantId)||String(item.estimateId)!==String(estimate.id)||String(item.securityOperationId)!==String(record.id))throw new VmosError_('Quote cost recovery context is invalid.','CONFLICT');var checkpointId=item.__checkpointId,type=item.__resourceType;delete item.__checkpointId;delete item.__resourceType;if(type==='AggregateMarker'){self.quoteMutationCheckpoints.update(checkpointId,{status:'COMPLETED',completedAt:self.clock(),completedBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'});return;}intended[type+':'+item.id]=true;var repo=type==='QuotePricingDecision'?self.quotePricing:self.quoteCostLines,existing=repo.get(item.id);if(existing){if(String(existing.tenantId)!==String(record.tenantId)||String(existing.estimateId)!==String(estimate.id))throw new VmosError_('Quote costing child belongs to another aggregate.','CONFLICT');repo.update(item.id,item);}else repo.create(item);self.quoteMutationCheckpoints.update(checkpointId,{status:'COMPLETED',completedAt:self.clock(),completedBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'});});[{repo:this.quoteCostLines,type:'QuoteCostLine'},{repo:this.quotePricing,type:'QuotePricingDecision'}].forEach(function(group){group.repo.byField(record.tenantId,'estimateId',estimate.id,200).forEach(function(item){if(!intended[group.type+':'+item.id]&&String(item.status||'ACTIVE')!=='REMOVED')group.repo.update(item.id,{status:'REMOVED',updatedAt:self.clock(),updatedBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'});});});return {estimate:estimate,lines:this.quoteCostLines.byField(record.tenantId,'estimateId',estimate.id,200),recoveredBy:recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'};}.bind(this));};
SecurityOperationRecoveryService_.prototype.recoverQuoteLifecycle_=function(record,recoveryContext){return this.withLock_(function(){var revision=this.quoteRevisions.get(record.resourceId),context=this.context_(record),action=context.action,quoteService=this.mvpFactory('Quote'),quote=quoteService.get(revision.quoteId),proof=String(revision.lastLifecycleOperationId||'')===String(record.id)&&String(revision.lastLifecycleFingerprint||'')===String(record.requestFingerprint)&&String(revision.lastLifecycleOperation||'')===String(action);if(String(revision.tenantId)!==String(record.tenantId)||String(quote.securityTenantId||quote.tenantId)!==String(record.tenantId)||!proof)throw new VmosError_('Quote lifecycle recovery proof is unavailable.','CONFLICT');var actor=String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY'),service=new MvpService_('Quote',{repository:quoteService.repository,auditUser:function(){return actor;}});if(action==='ISSUE'){if(String(revision.issuedBy)!==String(record.userId))throw new VmosError_('Quote issue attribution cannot be proven.','CONFLICT');service.update(quote.id,{status:'Issued',currentRevisionId:revision.id,issuedRevisionId:revision.id,total:Number(revision.totalMinor)/100,notes:'Issued customer revision '+revision.revisionNumber});}else if(action==='ACCEPT'){if(String(revision.acceptedBy)!==String(record.userId))throw new VmosError_('Quote acceptance attribution cannot be proven.','CONFLICT');service.update(quote.id,{status:'Accepted',currentRevisionId:revision.id,acceptedRevisionId:revision.id,notes:'Accepted customer revision '+revision.revisionNumber});}else throw new VmosError_('Quote lifecycle recovery action is invalid.','CONFLICT');return {revision:revision,recoveredBy:actor,originalActor:record.userId};}.bind(this));};

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
  if(record.operation==='configureShopFloorJob')return this.recoverShopFloorConfigurationEvents_(record,recoveryContext);
  var context=this.context_(record),commandId=context.commandId||record.idempotencyKey,existing=this.jobEvents.listByJobId(record.resourceId).filter(function(event){return String(event.commandId)===String(commandId);})[0],job=this.jobs.get(record.resourceId);
  if(existing)return job;
  this.jobEvents.append({id:'EVT-RECOVERY-'+record.id,jobId:job.id,eventType:context.eventType||'RECOVERED_OPERATION',occurredAt:record.occurredAt||this.clock(),actor:record.userId,previousStatus:'',newStatus:job.status||context.targetStatus||'',notes:'Recovered append-only audit event by '+String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY')+'.',workflowId:'',workflowVersion:'1',commandId:commandId});
  return job;
}.bind(this));};

SecurityOperationRecoveryService_.prototype.recoverShopFloorConfigurationEvents_=function(record,recoveryContext){
  var context=this.context_(record),probe=this.probeShopFloorConfiguration_(record,context);
  if(probe.outcome!=='COMPLETED')throw new VmosError_('Shop-floor configuration changed before recovery. Review is required.','CONFLICT');
  var self=this,events=this.jobEvents.listByJobId(record.resourceId),job=this.jobs.get(record.resourceId),commandId=record.correlationId;
  context.eventTypes.forEach(function(eventType){
    var exists=events.some(function(event){return String(event.commandId)===String(commandId)&&String(event.eventType)===String(eventType);});
    if(exists)return;
    self.jobEvents.append({id:'EVT-RECOVERY-'+record.id+'-'+eventType,jobId:job.id,eventType:eventType,occurredAt:record.mutationAt||record.occurredAt||self.clock(),actor:record.userId,previousStatus:eventType==='WORKFLOW_ASSIGNED'?context.previousStatus:'',newStatus:eventType==='WORKFLOW_ASSIGNED'?context.assignedStatus:'',notes:(eventType==='WORKFLOW_ASSIGNED'?'Workflow assigned for shop-floor control.':'Shop-floor QR identifier assigned.')+' Recovered by '+String(recoveryContext.actor||'SYSTEM:SECURITY_OPERATION_RECOVERY')+'.',workflowId:context.workflowId,workflowVersion:context.workflowVersion||'1',commandId:commandId});
    events.push({eventType:eventType,commandId:commandId});
  });
  return job;
};

SecurityOperationRecoveryService_.prototype.context_=function(record){try{return JSON.parse(record.recoveryJson||'{}');}catch(ignored){return {};}};
SecurityOperationRecoveryService_.prototype.isLeaseExpired_=function(record){var seconds=Number(record.leaseSeconds||120),expires=record.leaseExpiresAt||new Date(new Date(record.lastAttemptAt||record.occurredAt||0).getTime()+seconds*1000);return new Date(expires).getTime()<=new Date(this.clock()).getTime();};
SecurityOperationRecoveryService_.prototype.withLock_=function(operation){if(!this.lock)return operation();this.lock.waitLock(10000);try{return operation();}finally{this.lock.releaseLock();}};
