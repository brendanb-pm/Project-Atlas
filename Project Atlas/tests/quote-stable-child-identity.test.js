const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');
function E(message){this.message=message;this.code='ERROR'} E.prototype=Object.create(Error.prototype);
let uuidSequence=0;
const c=vm.createContext({Date,BigInt,String,Number,Boolean,Math,Array,Object,JSON,VmosValidationError_:E,VmosAuthorizationError_:E,VmosConflictError:E,Utilities:{getUuid:()=>`UUID-${++uuidSequence}`}});
vm.runInContext(fs.readFileSync(path.join(root,'ConfigQuoteCosting.gs'),'utf8')+fs.readFileSync(path.join(root,'Services','QuoteCostingService.gs'),'utf8')+fs.readFileSync(path.join(root,'Services','QuoteRevisionService.gs'),'utf8'),c);
function repo(seed=[]){return {rows:seed.map(x=>({...x})),get(id){return this.rows.find(x=>x.id===id)},create(x){if(this.get(x.id))throw Error('duplicate '+x.id);this.rows.push({...x});return x},update(id,x){const row=this.get(id);if(!row)throw Error('missing '+id);Object.assign(row,x);return row},byField(t,k,v,l){return this.rows.filter(x=>String(x.tenantId)===String(t)&&String(x[k])===String(v)).slice(0,l)},forTenant(t){return this.rows.filter(x=>String(x.tenantId)===String(t))}}}
const context=n=>({tenantId:'T-A',userId:'USER-A',operationId:'OP-'+n,requestFingerprint:'FP-'+n});

// Customer Quote lines retain identity across reorder, delete, and insertion.
const quotes=repo([{id:'Q-1',customerId:'C-1',securityTenantId:'T-A'}]),customers=repo([{id:'C-1',name:'Customer',securityTenantId:'T-A'}]),revisionRows=repo(),quoteLines=repo(),revisionCheckpoints=repo();
const revisions=new c.QuoteRevisionService_({revisions:revisionRows,lines:quoteLines,quotes,customers,mutationCheckpoints:revisionCheckpoints,uuid:()=>`RUUID-${++uuidSequence}`,clock:()=>new Date('2026-08-15T12:00:00Z')});
let revision=revisions.saveDraft({quoteId:'Q-1',lines:[{description:'A',quantity:'1',unitPriceMinor:'100'},{description:'B',quantity:'1',unitPriceMinor:'200'},{description:'C',quantity:'1',unitPriceMinor:'300'}]},context(1),'REV-1');
const lineIds=Object.fromEntries(revision.lines.map(x=>[x.description,x.id]));
revision=revisions.saveDraft({id:'REV-1',quoteId:'Q-1',lines:[{id:lineIds.C,description:'C',quantity:'1',unitPriceMinor:'300'},{id:lineIds.A,description:'A',quantity:'1',unitPriceMinor:'100'},{id:lineIds.B,description:'B',quantity:'1',unitPriceMinor:'200'}]},context(2));
assert.deepEqual(revision.lines.map(x=>x.id),[lineIds.C,lineIds.A,lineIds.B],'reorder changes sequence, not identity');
revision=revisions.saveDraft({id:'REV-1',quoteId:'Q-1',lines:[{id:lineIds.C,description:'C',quantity:'1',unitPriceMinor:'300'},{id:lineIds.B,description:'B',quantity:'1',unitPriceMinor:'200'}]},context(3));
assert.equal(quoteLines.get(lineIds.A).status,'REPLACED');assert.deepEqual(revision.lines.map(x=>x.id),[lineIds.C,lineIds.B]);
revision=revisions.saveDraft({id:'REV-1',quoteId:'Q-1',lines:[{id:lineIds.C,description:'C',quantity:'1',unitPriceMinor:'300'},{description:'D',quantity:'1',unitPriceMinor:'400'},{id:lineIds.B,description:'B',quantity:'1',unitPriceMinor:'200'}]},context(4));
const dId=revision.lines[1].id;assert.notEqual(dId,lineIds.A,'removed identity is never reused');assert.equal(revision.lines[2].id,lineIds.B);
assert.throws(()=>revisions.saveDraft({id:'REV-1',quoteId:'Q-1',lines:[{id:'FOREIGN-LINE',description:'X',quantity:'1',unitPriceMinor:'1'}]},context(5)),/identity is unavailable/);
assert(revisionCheckpoints.rows.filter(x=>x.operationId==='OP-4').some(x=>x.resourceId===lineIds.B),'recovery checkpoint preserves stable customer-line identity');

// Cost lines and pricing decisions retain stable identity and their provenance targets do not shift.
const estimates=repo(),costLines=repo(),pricing=repo(),costCheckpoints=repo(),vendors=repo([{id:'V-1',tenantId:'T-A',name:'Canonical Vendor',status:'ACTIVE'}]);
const costing=new c.QuoteCostingService_({quotes,revisions:revisionRows,quoteLines,vendors,vendorEstimates:repo(),sourceDocuments:repo(),estimates,lines:costLines,pricing,documents:repo(),mutationCheckpoints:costCheckpoints,uuid:()=>`CUUID-${++uuidSequence}`,clock:()=>new Date('2026-08-15T12:00:00Z')});
const base={quoteId:'Q-1',quoteRevisionId:'REV-1',quoteQuantity:'1',currency:'USD',customerRecurringMinor:'1000'};
let saved=costing.save({...base,lines:[{description:'Material A',basis:'PER_PART',costEachMinor:'100',vendorId:'V-1'},{description:'Welding B',basis:'PER_PART',costEachMinor:'200'},{description:'Coating C',basis:'PER_PART',costEachMinor:'300'}],pricing:[{quoteLineItemId:lineIds.B,method:'MANUAL_PRICE',sellUnitPriceMinor:'1000'}]},context(6),'EST-1');
const costIds=Object.fromEntries(saved.rollup.lines.map(x=>[x.description,x.id])),pricingId=saved.pricing[0].id,sourceLink={costLineId:costIds['Welding B']};
saved=costing.save({...base,id:'EST-1',version:saved.estimate.version,lines:[{id:costIds['Coating C'],description:'Coating C',basis:'PER_PART',costEachMinor:'300'},{id:costIds['Material A'],description:'Material A',basis:'PER_PART',costEachMinor:'100',vendorId:'V-1'},{id:costIds['Welding B'],description:'Welding B',basis:'PER_PART',costEachMinor:'200'}],pricing:[{id:pricingId,quoteLineItemId:lineIds.B,method:'MANUAL_PRICE',sellUnitPriceMinor:'1000'}]},context(7));
assert.deepEqual(saved.rollup.lines.map(x=>x.id),[costIds['Coating C'],costIds['Material A'],costIds['Welding B']]);assert.equal(saved.pricing[0].id,pricingId);
saved=costing.save({...base,id:'EST-1',version:saved.estimate.version,lines:[{id:costIds['Coating C'],description:'Coating C',basis:'PER_PART',costEachMinor:'300'},{id:costIds['Welding B'],description:'Welding B',basis:'PER_PART',costEachMinor:'200'}],pricing:[{id:pricingId,quoteLineItemId:lineIds.B,method:'MANUAL_PRICE',sellUnitPriceMinor:'1000'}]},context(8));
assert.equal(costLines.get(costIds['Material A']).status,'REMOVED');assert.equal(costLines.get(sourceLink.costLineId).description,'Welding B','source link remains attached to the original logical cost line');
saved=costing.save({...base,id:'EST-1',version:saved.estimate.version,lines:[{id:costIds['Coating C'],description:'Coating C',basis:'PER_PART',costEachMinor:'300'},{description:'New D',basis:'PER_PART',costEachMinor:'400'},{id:costIds['Welding B'],description:'Welding B',basis:'PER_PART',costEachMinor:'200'}],pricing:[{id:pricingId,quoteLineItemId:lineIds.B,method:'MANUAL_PRICE',sellUnitPriceMinor:'1000'}]},context(9));
assert.notEqual(saved.rollup.lines[1].id,costIds['Material A']);assert.equal(saved.rollup.lines[2].id,costIds['Welding B']);assert.equal(saved.pricing[0].id,pricingId);
assert.equal(costCheckpoints.rows.find(x=>x.operationId==='OP-9'&&x.resourceId===pricingId).resourceType,'QuotePricingDecision');
assert.throws(()=>costing.save({...base,id:'EST-1',version:saved.estimate.version,lines:[{id:'FOREIGN-COST',description:'X',basis:'PER_PART',costEachMinor:'1'}]},context(10)),/identity is unavailable/);
assert.throws(()=>costing.save({...base,id:'EST-1',version:saved.estimate.version,lines:saved.rollup.lines,pricing:[{id:'FOREIGN-PRICE',quoteLineItemId:lineIds.B,method:'MANUAL_PRICE',sellUnitPriceMinor:'1000'}]},context(11)),/identity is unavailable/);
assert(costCheckpoints.rows.filter(x=>x.operationId==='OP-9').some(x=>x.resourceId===costIds['Welding B']),'recovery checkpoint preserves stable cost-line identity');

// A proven-not-completed retry reuses operation-bound child IDs and the original durable intent.
const retryEstimates=repo(),retryLines=repo(),retryPricing=repo(),retryCheckpoints=repo();let failParent=true,clockTick=0;
const retryEstimateCreate=retryEstimates.create.bind(retryEstimates);retryEstimates.create=function(row){if(failParent)throw Error('parent unavailable');return retryEstimateCreate(row);};
const retryCosting=new c.QuoteCostingService_({quotes,revisions:revisionRows,quoteLines,vendors,vendorEstimates:repo(),sourceDocuments:repo(),estimates:retryEstimates,lines:retryLines,pricing:retryPricing,documents:repo(),mutationCheckpoints:retryCheckpoints,clock:()=>new Date(1000*(++clockTick))});
const retryInput={...base,lines:[{description:'Retry material',basis:'PER_PART',costEachMinor:'50'}],pricing:[{quoteLineItemId:lineIds.B,method:'MANUAL_PRICE',sellUnitPriceMinor:'1000'}]};
assert.throws(()=>retryCosting.save(retryInput,context('RETRY'),'EST-RETRY'),/parent unavailable/);const intendedRetryLine=JSON.parse(retryCheckpoints.rows.find(x=>x.resourceType==='QuoteCostLine').payloadJson);failParent=false;
const retried=retryCosting.save(retryInput,context('RETRY'),'EST-RETRY');assert.equal(retried.rollup.lines[0].id,intendedRetryLine.id);assert.equal(String(retried.rollup.lines[0].createdAt),String(intendedRetryLine.createdAt));assert.equal(retryLines.rows.length,1);

// Vendor labels are hydrated in one tenant-scoped directory read; missing references remain explicit.
costLines.get(costIds['Welding B']).vendorId='V-MISSING';
const hydrated=costing.read('Q-1',context(12),{canManagePricing:true});
assert.equal(hydrated.lines.find(x=>x.id===costIds['Material A']),undefined,'removed line stays removed');
assert.equal(hydrated.lines.find(x=>x.id===costIds['Welding B']).vendorName,'Vendor unavailable');
assert.equal(hydrated.lines.find(x=>x.id===costIds['Welding B']).vendorReferenceState,'UNAVAILABLE');
const ui=fs.readFileSync(path.join(root,'UI','QuoteLifecycleUi.html'),'utf8')+fs.readFileSync(path.join(root,'UI','QuoteBuilder.html'),'utf8');
['row.dataset.costLineId','item={id:row.dataset.costLineId','Select the Vendor from the search results','vendorName','vendorReferenceState','state.revisionLines'].forEach(value=>assert(ui.includes(value),value));
console.log('MOS-126I stable Quote child identity, provenance, recovery checkpoint, and Vendor UX tests passed');
