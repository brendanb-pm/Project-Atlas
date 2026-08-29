const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');
class Validation extends Error{} class Authorization extends Error{} class Conflict extends Error{}
const context={Date,Math,Number,String,Object,Array,JSON,encodeURIComponent,VmosValidationError_:Validation,VmosAuthorizationError_:Authorization,VmosConflictError:Conflict,requireValue_:(value,label)=>{if(value===undefined||value===null||value==='')throw new Validation(label+' is required.');},serializeVmosValue_:value=>JSON.parse(JSON.stringify(value))};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'Services','JobDomainService.gs'),'utf8'),context);

const tenant='TENANT-A',authority={tenantId:tenant,userId:'USER-A',operationId:'OP-1',requestFingerprint:'FP-1',authoritative:true};
const customer={id:'CUSTOMER-A',securityTenantId:tenant},activeAsset={id:'ASSET-11111111-1111-4111-8111-111111111111',assetCode:'MILL-04',name:'Haas VF-4',category:'MACHINE',status:'ACTIVE',version:1,securityTenantId:tenant};
assert.equal(context.atlasJobClassification_({customerId:'CUSTOMER-A'}),'CUSTOMER','legacy customer-linked Job remains CUSTOMER');
assert.equal(context.atlasJobDisplay_({}).label,'CLASSIFICATION REVIEW REQUIRED','ambiguous legacy Jobs must not be silently treated as Internal or Customer work');
assert.equal(context.validateAtlasJobContract_({workClassification:'CUSTOMER',customerId:'CUSTOMER-A'},{tenantId:tenant,customer}),'CUSTOMER');
assert.throws(()=>context.validateAtlasJobContract_({workClassification:'CUSTOMER'},{tenantId:tenant}),/Customer/);
assert.throws(()=>context.validateAtlasJobContract_({workClassification:'CUSTOMER',customerId:'CUSTOMER-A',internalWorkType:'REPAIR'},{tenantId:tenant,customer}),/Internal Work Type/);
assert.equal(context.validateAtlasJobContract_({workClassification:'INTERNAL',internalWorkType:'REPAIR',title:'Repair spindle',assetId:activeAsset.id},{tenantId:tenant,asset:activeAsset}),'INTERNAL');
assert.equal(context.validateAtlasJobContract_({workClassification:'INTERNAL',internalWorkType:'FACILITY',description:'Reorganize storage'},{tenantId:tenant}),'INTERNAL');
assert.throws(()=>context.validateAtlasJobContract_({workClassification:'INTERNAL',title:'No type'},{tenantId:tenant}),/valid Internal Work Type/);
assert.throws(()=>context.validateAtlasJobContract_({workClassification:'INTERNAL',internalWorkType:'REPAIR',title:'Forged',customerId:'CUSTOMER-A'},{tenantId:tenant,customer}),/cannot carry Customer/);
assert.throws(()=>context.validateAtlasJobContract_({workClassification:'INTERNAL',internalWorkType:'REPAIR',title:'Forged',assetId:activeAsset.id},{tenantId:tenant,asset:{...activeAsset,securityTenantId:'TENANT-B'}}),/unavailable/);
assert.equal(context.validateAtlasJobContract_({workClassification:'INTERNAL',internalWorkType:'REPAIR',title:'Historical link',assetId:activeAsset.id},{tenantId:tenant,asset:{...activeAsset,status:'ARCHIVED'},existing:{assetId:activeAsset.id}}),'INTERNAL','archiving an Asset must not invalidate its historical Job reference');

const assetRows=[activeAsset,{...activeAsset,id:'ASSET-22222222-2222-4222-8222-222222222222',assetCode:'OLD-01',status:'ARCHIVED',archivedAt:new Date(),securityTenantId:tenant},{...activeAsset,id:'ASSET-33333333-3333-4333-8333-333333333333',assetCode:'FOREIGN-01',securityTenantId:'TENANT-B'}];
const assetStore={list:()=>assetRows.slice(),get:id=>assetRows.find(row=>row.id===id),create:(input,id)=>{const row={...input,id,securityTenantId:tenant};assetRows.push(row);return row;},update:(id,changes)=>{const row=assetRows.find(item=>item.id===id);Object.assign(row,changes);return row;}};
const assets=new context.AssetService_({records:assetStore,limit:1,candidateLimit:5});
let result=assets.search('',authority);assert.equal(result.items.length,1);assert.equal(result.items[0].assetCode,'MILL-04');assert.equal(result.bound,1);assert(!JSON.stringify(result).includes('TENANT-B'),'Asset search must not disclose foreign tenant records');
assert.throws(()=>assets.create({assetCode:'NEW-01',name:'New',category:'TOOL'},authority,'ASSET-not-canonical'),/canonical/i);
const created=assets.create({assetCode:'fixture-01',name:'Fixture cart',category:'FIXTURE'},authority,'ASSET-44444444-4444-4444-8444-444444444444');assert.equal(created.assetCode,'FIXTURE-01');assert.equal(created.status,'ACTIVE');
assert.throws(()=>assets.create({assetCode:'MILL-04',name:'Duplicate',category:'MACHINE'},authority,'ASSET-55555555-5555-4555-8555-555555555555'),/already exists/);
assert.throws(()=>assets.update(activeAsset.id,{name:'Stale',expectedVersion:9},authority),/changed elsewhere/);
assets.update(activeAsset.id,{name:'Haas VF-4 Updated',expectedVersion:1,status:'ARCHIVED'},authority);assert.equal(activeAsset.status,'ACTIVE','ordinary update cannot mass-assign archive status');assert.equal(activeAsset.version,2);
assets.archive(activeAsset.id,2,authority);assert.equal(activeAsset.status,'ARCHIVED');assert.equal(activeAsset.version,3);

const jobs=[];const jobStore={create:(record,id)=>{const row={...record,id,securityTenantId:tenant};jobs.push(row);return row;}};
const domain=new context.JobDomainService_({jobs:jobStore,assets});const internal=domain.createInternal({internalWorkType:'MAINTENANCE',title:'Service compressor',priority:'HIGH'},authority,'JOB-11111111-1111-4111-8111-111111111111');assert.equal(internal.workClassification,'INTERNAL');assert.equal(internal.customerId,undefined);assert.equal(internal.status,'Planned');

const immutableRows=[{id:'JOB-CUSTOMER',customerId:'CUSTOMER-A',workClassification:'CUSTOMER',status:'Planned',version:1,securityTenantId:tenant}],immutableRepository={findById:id=>immutableRows.find(row=>row.id===id),updateById:(id,changes)=>Object.assign(immutableRows[0],changes),list:()=>immutableRows.slice()};
const mvpContext={Date,Math,Number,String,Object,Array,JSON,VmosValidationError_:Validation,VmosAuthorizationError_:Authorization,VmosConflictError:Conflict,requireValue_:context.requireValue_,validateEntityInput_:()=>{},getVmosConfig_:()=>({mapping:{Job:{idPrefix:'JOB',fields:{updatedAt:['Updated At'],updatedBy:['Updated By'],securityTenantId:['Security Tenant ID']}},Customer:{fields:{}},Quote:{fields:{}},Asset:{fields:{}},Invoice:{fields:{}}}}),createRepository_:()=>immutableRepository,generateVmosId_:()=>'',getVmosAuditUser_:()=>'',atlasJobClassification_:context.atlasJobClassification_,validateAtlasJobContract_:context.validateAtlasJobContract_};vm.createContext(mvpContext);vm.runInContext(fs.readFileSync(path.join(root,'Services','MvpServices.gs'),'utf8'),mvpContext);const immutableService=new mvpContext.MvpService_('Job',{repository:immutableRepository,auditUser:()=>authority.userId,mutationProof:{tenantId:tenant}});assert.throws(()=>immutableService.update('JOB-CUSTOMER',{workClassification:'INTERNAL',customerId:'',internalWorkType:'REPAIR',title:'Rewrite history'}),/classification cannot be changed/);

function records(rows){return {list:()=>rows.slice(),get:id=>rows.find(row=>row.id===id)||null,listByField:(field,value,limit)=>rows.filter(row=>String(row[field])===String(value)).slice(0,limit),findFirstByField:(field,value)=>rows.find(row=>String(row[field])===String(value))||null};}
context.MvpService_=function(){throw new Error('Unexpected storage construction');};context.VmosNotFoundError_=class extends Error{};
vm.runInContext(fs.readFileSync(path.join(root,'Services','CommercialWorkflowService.gs'),'utf8'),context);
const internalRow={id:'JOB-INTERNAL',securityTenantId:tenant,workClassification:'INTERNAL',internalWorkType:'REPAIR',title:'Repair coolant leak',status:'PLANNED',assetId:'ASSET-X'};
const workflow=new context.CommercialWorkflowService_({customers:records([]),rfqs:records([]),quotes:records([]),jobs:records([internalRow]),invoices:records([])}),commercialContext={tenantId:tenant,userId:'USER-A',capabilities:['OPERATIONS_WRITE','FINANCE_WRITE']};
const workspace=workflow.get({route:'jobs',id:internalRow.id},commercialContext);assert.equal(workspace.selected.workClassification,'INTERNAL');assert.equal(workspace.context.customer,null);assert.equal(workspace.related.invoice,undefined);assert.equal(workspace.actions.createInvoice,false);assert.throws(()=>workflow.createInvoice(internalRow.id,{},commercialContext,'INV-X'),/not eligible/);

vm.runInContext(fs.readFileSync(path.join(root,'Services','FloorBoardService.gs'),'utf8'),context);context.normalizeDashboardText_=value=>String(value||'').toUpperCase();
const board=new context.FloorBoardService_({jobs:{list:()=>[internalRow]},customers:{list:()=>[]},tokens:{list:()=>[]},events:{list:()=>[]},clock:()=>new Date('2026-08-29T00:00:00Z')}).get();assert.equal(board.items[0].classificationLabel,'INTERNAL · REPAIR');assert.equal(board.items[0].customerName,'INTERNAL · REPAIR');assert.equal(board.repositoryReads,4,'Asset enrichment must not add an N+1 read');

const code=fs.readFileSync(path.join(root,'UI','Code.gs'),'utf8'),registry=fs.readFileSync(path.join(root,'Services','EndpointAuthorizationRegistry.gs'),'utf8'),mvp=fs.readFileSync(path.join(root,'Services','MvpServices.gs'),'utf8'),commercialUi=fs.readFileSync(path.join(root,'UI','CommercialWorkflow.html'),'utf8'),canvasUi=fs.readFileSync(path.join(root,'UI','JobCanvas.html'),'utf8'),shopUi=fs.readFileSync(path.join(root,'UI','ShopFloor.html'),'utf8'),travelerUi=fs.readFileSync(path.join(root,'UI','Traveler.html'),'utf8'),migration=fs.readFileSync(path.join(__dirname,'..','runtime','secure-session-edge','src','domain-migrations.js'),'utf8');
for(const token of ['getInternalJobCreationOptions','createInternalJob','createShopAsset','updateShopAsset','archiveShopAsset']){assert(code.includes('function '+token),token);assert(registry.includes(token+':{'),token+' authorization');}
assert.match(registry,/createInternalJob:\{kind:'HIGH_RISK_WRITE',capability:'OPERATIONS_WRITE'\}/);assert.match(mvp,/Job classification cannot be changed after creation/);assert.match(mvp,/Use the authorized Internal Job creation flow|validateAtlasJobContract_/);
assert.match(code,/function updateMvpRecord[\s\S]*mutationProof:securityMutationProof_\(a\)/,'generic updates must pass trusted tenant authority into persistence validation');
for(const token of ['Work Type','Customer Work','Internal Work','Internal Work Type','Find active Asset','aria-busy','jobOptionsGeneration'])assert(commercialUi.includes(token),token);
assert.match(commercialUi,/owner!==jobOptionsGeneration/);assert.match(commercialUi,/No Asset linked/);assert.doesNotMatch(commercialUi,/fake Customer|CustomerID NULL = INTERNAL/);
assert.match(canvasUi,/classificationLabel/);assert.match(shopUi,/Asset \/ equipment/);assert.match(travelerUi,/workClassification/);
for(const token of ['0006_internal_jobs_and_assets','CREATE TABLE atlas_assets','work_classification','atlas_jobs_classification_authority_check','atlas_jobs_asset_fk','atlas_jobs_internal_type_idx'])assert(migration.includes(token),token);
assert.doesNotMatch(migration,/CREATE TABLE atlas_travelers|traveler_id/i);assert.match(migration,/DEFAULT 'CUSTOMER'/);assert.match(migration,/ALTER COLUMN customer_id DROP NOT NULL/);
console.log('MOS-135 internal Job, Asset, commercial guardrail, operational projection, UX, and schema contract tests passed');
