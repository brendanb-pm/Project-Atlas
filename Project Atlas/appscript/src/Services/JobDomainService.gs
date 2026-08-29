/** MOS-135 authoritative classification and tenant-owned shop Asset contract. */
var ATLAS_JOB_CLASSIFICATIONS_=['CUSTOMER','INTERNAL'];
var ATLAS_INTERNAL_WORK_TYPES_=['MAINTENANCE','REPAIR','FIXTURE_TOOLING','CAPITAL_IMPROVEMENT','R_AND_D_PROTOTYPE','FACILITY','OTHER'];

function atlasJobClassification_(job){
  var explicit=String(job&&job.workClassification||'').trim().toUpperCase();
  if(explicit)return explicit;
  return job&&(job.customerId||job.quoteId)?'CUSTOMER':'';
}
function atlasInternalWorkType_(job){return String(job&&job.internalWorkType||'').trim().toUpperCase();}
function atlasJobDisplay_(job){
  var classification=atlasJobClassification_(job),internalType=atlasInternalWorkType_(job);
  return {classification:classification,label:classification==='INTERNAL'?'INTERNAL'+(internalType?' · '+internalType.replace(/_/g,' '):''):classification==='CUSTOMER'?'CUSTOMER':'CLASSIFICATION REVIEW REQUIRED',internalWorkType:internalType};
}
function validateAtlasJobContract_(job,options){
  options=options||{};var classification=atlasJobClassification_(job),internalType=atlasInternalWorkType_(job),tenant=String(options.tenantId||job.securityTenantId||job.tenantId||'');
  if(ATLAS_JOB_CLASSIFICATIONS_.indexOf(classification)===-1)throw new VmosValidationError_('Choose Customer Work or Internal Work.');
  if(classification==='CUSTOMER'){
    requireValue_(job.customerId,'Customer');
    if(internalType)throw new VmosValidationError_('Customer work cannot use an Internal Work Type.');
    if(job.assetId)throw new VmosValidationError_('Tenant shop Assets apply only to Internal work.');
  }else{
    if(ATLAS_INTERNAL_WORK_TYPES_.indexOf(internalType)===-1)throw new VmosValidationError_('Choose a valid Internal Work Type.');
    if(job.customerId||job.quoteId||job.acceptedQuoteRevisionId)throw new VmosValidationError_('Internal work cannot carry Customer, RFQ, or Quote authority.');
    if(!String(job.title||job.description||'').trim())throw new VmosValidationError_('Internal work title or description is required.');
  }
  if(options.customer&&tenant&&String(options.customer.securityTenantId||options.customer.tenantId||'')!==tenant)throw new VmosAuthorizationError_('Customer is unavailable.');
  if(options.quote&&tenant&&String(options.quote.securityTenantId||options.quote.tenantId||'')!==tenant)throw new VmosAuthorizationError_('Quote is unavailable.');
  if(options.asset){
    if(classification!=='INTERNAL')throw new VmosValidationError_('Only Internal work may reference a tenant shop Asset.');
    if(tenant&&String(options.asset.securityTenantId||options.asset.tenantId||'')!==tenant)throw new VmosAuthorizationError_('Asset is unavailable.');
    if(String(options.asset.status||'ACTIVE').toUpperCase()!=='ACTIVE'&&(!options.existing||String(options.existing.assetId||'')!==String(job.assetId||'')))throw new VmosValidationError_('Choose an active Asset.');
  }
  return classification;
}

function AssetService_(dependencies){dependencies=dependencies||{};this.records=dependencies.records||null;this.limit=Math.min(50,Math.max(1,Number(dependencies.limit||25)));this.candidateLimit=Math.min(200,Math.max(this.limit,Number(dependencies.candidateLimit||this.limit*4)));}
AssetService_.prototype.service_=function(context){return this.records||new MvpService_('Asset',{auditUser:function(){return context.userId;},mutationProof:{operationId:context.operationId,fingerprint:context.requestFingerprint,tenantId:context.tenantId,actorId:context.userId}});};
AssetService_.prototype.tenant_=function(row,context){if(!row||String(row.securityTenantId||row.tenantId||'')!==String(context.tenantId||''))throw new VmosAuthorizationError_('Asset is unavailable.');return row;};
AssetService_.prototype.scope_=function(context){return {kind:'TENANT',tenantId:String(context.tenantId),actorId:String(context.userId||''),authoritative:true};};
AssetService_.prototype.rows_=function(context){var service=this.service_(context),provider=service.repository,rows;if(provider&&provider.listForScope){var result=provider.listForScope(this.scope_(context),{limit:this.candidateLimit,filters:{status:'ACTIVE'},orderBy:{field:'assetCode',direction:'ASC'}});return {items:result.items,candidateTruncated:result.hasMore===true};}rows=service.list().filter(function(row){return String(row.securityTenantId||row.tenantId||'')===String(context.tenantId);});return {items:rows.slice(0,this.candidateLimit),candidateTruncated:rows.length>this.candidateLimit};};
AssetService_.prototype.search=function(query,context){var term=String(query||'').trim().toLowerCase(),candidates=this.rows_(context),rows=candidates.items.filter(function(row){return String(row.status||'ACTIVE').toUpperCase()==='ACTIVE'&&(!term||[row.assetCode,row.name,row.category].some(function(value){return String(value||'').toLowerCase().indexOf(term)!==-1;}));});return {items:rows.slice(0,this.limit).map(function(row){return {id:row.id,assetCode:row.assetCode,name:row.name,category:row.category,status:row.status||'ACTIVE'};}),truncated:candidates.candidateTruncated||rows.length>this.limit,bound:this.limit,candidateBound:this.candidateLimit};};
AssetService_.prototype.create=function(input,context,resourceId){input=input||{};var service=this.service_(context),provider=service.repository,code=String(input.assetCode||'').trim().toUpperCase(),duplicate;if(!/^ASSET-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(String(resourceId||'')))throw new VmosValidationError_('Canonical Asset identity is required.');if(!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(code))throw new VmosValidationError_('Asset Code must use 2–64 letters, numbers, dots, dashes, or underscores.');if(provider&&provider.findUniqueForScope)duplicate=provider.findUniqueForScope(this.scope_(context),{assetCode:code});else duplicate=service.list().filter(function(row){return String(row.securityTenantId||row.tenantId||'')===String(context.tenantId)&&String(row.assetCode||'').toUpperCase()===code;})[0];if(duplicate)throw new VmosConflictError('Asset Code already exists.');return service.create({assetCode:code,name:input.name,description:input.description||'',category:input.category,status:'ACTIVE',version:1},resourceId);};
AssetService_.prototype.update=function(id,changes,context){var service=this.service_(context),existing=this.tenant_(service.get(id),context),allowed={},expected=Number(changes&&changes.expectedVersion);changes=changes||{};if(Object.prototype.hasOwnProperty.call(changes,'assetCode')&&String(changes.assetCode).trim().toUpperCase()!==String(existing.assetCode))throw new VmosValidationError_('Asset Code cannot be changed.');if(isFinite(expected)&&expected!==Number(existing.version||1))throw new VmosConflictError('Asset changed elsewhere. Refresh and review it before trying again.');['name','description','category'].forEach(function(key){if(Object.prototype.hasOwnProperty.call(changes,key))allowed[key]=changes[key];});allowed.version=Number(existing.version||1)+1;return service.update(id,allowed);};
AssetService_.prototype.archive=function(id,expectedVersion,context){var service=this.service_(context),existing=this.tenant_(service.get(id),context);if(expectedVersion!==undefined&&Number(expectedVersion)!==Number(existing.version||1))throw new VmosConflictError('Asset changed elsewhere. Refresh and review it before trying again.');return service.update(id,{status:'ARCHIVED',archivedAt:new Date(),version:Number(existing.version||1)+1});};

function JobDomainService_(dependencies){dependencies=dependencies||{};this.jobs=dependencies.jobs||null;this.assets=dependencies.assets||new AssetService_({records:dependencies.assetRecords,limit:dependencies.assetLimit});}
JobDomainService_.prototype.jobService_=function(context){return this.jobs||new MvpService_('Job',{auditUser:function(){return context.userId;},mutationProof:{operationId:context.operationId,fingerprint:context.requestFingerprint,tenantId:context.tenantId,actorId:context.userId}});};
JobDomainService_.prototype.creationOptions=function(query,context){return {classifications:ATLAS_JOB_CLASSIFICATIONS_.slice(),internalWorkTypes:ATLAS_INTERNAL_WORK_TYPES_.slice(),assets:this.assets.search(query,context),assetReadModel:'BOUNDED_ACTIVE_ASSET_SEARCH'};};
JobDomainService_.prototype.createInternal=function(input,context,resourceId){input=input||{};var record={workClassification:'INTERNAL',internalWorkType:String(input.internalWorkType||'').toUpperCase(),title:input.title||'',description:input.description||'',assetId:input.assetId||'',priority:input.priority||'',dueDate:input.dueDate||'',plannedStart:input.plannedStart||'',ownerUserId:input.ownerUserId||'',status:'Planned',version:1};return this.jobService_(context).create(record,resourceId);};
