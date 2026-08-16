const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');
const source=fs.readFileSync(path.join(root,'Services','QuoteCostingService.gs'),'utf8').split('function VendorService_')[0]+fs.readFileSync(path.join(root,'Services','QuoteRevisionService.gs'),'utf8');
function ErrorType(message){this.message=message;} ErrorType.prototype=Object.create(Error.prototype);
const c=vm.createContext({Date,BigInt,String,Number,Math,Array,Object,VmosValidationError_:ErrorType,VmosAuthorizationError_:ErrorType,VmosConflictError:ErrorType});vm.runInContext(source,c);
function repo(seed){const rows=seed||[];return {rows,get:id=>rows.find(x=>x.id===id),create:x=>{if(rows.some(y=>y.id===x.id))throw Error('duplicate');rows.push({...x});return x;},update:(id,changes)=>{const x=rows.find(y=>y.id===id);Object.assign(x,changes);return x;},byField:(tenant,key,value,limit)=>rows.filter(x=>x.tenantId===tenant&&String(x[key])===String(value)).slice(0,limit)};}
const tenant='T1',context={tenantId:tenant,userId:'USER-A',operationId:'OP-1',requestFingerprint:'FP-1'};
const quotes=repo([{id:'VMC-0128',rfqId:'RFQ-1',customerId:'CUS-1',securityTenantId:tenant,status:'Draft',paymentTerms:'Net 30'}]);
const customers=repo([{id:'CUS-1',name:'H2 Customer',securityTenantId:tenant}]),jobs=repo(),revisions=repo(),lines=repo();
function MvpService(entity,deps){this.repository=deps.repository;this.update=(id,changes)=>this.repository.update(id,changes);}c.MvpService_=MvpService;
const service=new c.QuoteRevisionService_({revisions,lines,quotes:{get:quotes.get,repository:quotes},customers:{get:customers.get},jobs,clock:()=>new Date('2026-08-15T12:00:00Z'),uuid:()=> 'FIXED'});
const saved=service.saveDraft({quoteId:'VMC-0128',description:'H2 plate assembly, complete per agreed scope',currency:'USD',lines:[{description:'H2 plate assembly, complete per agreed scope',quantity:'18',unitPriceMinor:'69474',lineType:'RECURRING'},{description:'NRE/tooling',quantity:'1',unitPriceMinor:'0',lineType:'ONE_TIME'}]},context,'QREV-128-R1');
assert.equal(saved.revision.recurringTotalMinor,'1250532');assert.equal(saved.revision.oneTimeTotalMinor,'0');assert.equal(saved.revision.totalMinor,'1250532');
const issued=service.issue(saved.revision.id,saved.revision.version,context);assert.equal(issued.status,'ISSUED');assert.equal(issued.totalMinor,'1250532');assert.deepEqual(Object.keys(issued.lines[0]).sort(),['description','extendedPriceMinor','lineType','quantity','unitPriceMinor'].sort());
['vendorId','supplierCost','margin','costEstimate','sourceDocument','securityOperationId','OnlineMetals'].forEach(key=>assert.equal(JSON.stringify(issued).includes(key),false,key));
assert.throws(()=>service.saveDraft({id:saved.revision.id,quoteId:'VMC-0128',lines:[{description:'changed',quantity:'1',unitPriceMinor:'1'}]},context),/immutable/);
const accepted=service.accept(saved.revision.id,revisions.get(saved.revision.id).version,context);assert.equal(accepted.status,'ACCEPTED');assert.equal(quotes.get('VMC-0128').acceptedRevisionId,saved.revision.id);assert.equal(service.accept(saved.revision.id,revisions.get(saved.revision.id).version,context).status,'ACCEPTED');
assert.throws(()=>service.output(saved.revision.id,{tenantId:'OTHER',userId:'X'}),/unavailable/);assert.equal(lines.rows.length,2);
console.log('MOS-126F quote revision tests passed');
