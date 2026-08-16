const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..','appscript','src');let seq=0;
const c=vm.createContext({String,Number,Boolean,Date,Object,Array,Math,JSON,Utilities:{getUuid:()=>String(++seq).padStart(4,'0')},VmosValidationError_:function(m){this.message=m;this.code='VALIDATION_ERROR'},VmosAuthorizationError_:function(m){this.message=m;this.code='AUTHORIZATION_ERROR'}});
['ConfigQuoteCosting.gs','Services/QuoteCostingService.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c));
const engine=new c.QuoteCostEngine_();
const lines=[
 {description:'Tubing',basis:'BATCH_TOTAL',sourceAmountMinor:'108452',allocationQuantity:'18',vendorId:'VND-1',summaryGroupKey:'ONLINE',currency:'USD'},
 {description:'Plate',basis:'BATCH_TOTAL',sourceAmountMinor:'60080',allocationQuantity:'18',vendorId:'VND-1',summaryGroupKey:'ONLINE',currency:'USD'},
 {description:'Freight',basis:'BATCH_TOTAL',sourceAmountMinor:'47286',allocationQuantity:'18',vendorId:'VND-1',summaryGroupKey:'ONLINE',currency:'USD'},
 {description:'Supplier tax',basis:'BATCH_TOTAL',sourceAmountMinor:'19207',allocationQuantity:'18',vendorId:'VND-1',summaryGroupKey:'ONLINE',currency:'USD'},
 {description:'Prep',basis:'PER_PART',costEachMinor:'1000',currency:'USD'},
 {description:'Op 1',basis:'PER_PART',costEachMinor:'9500',currency:'USD'},
 {description:'Op 2',basis:'PER_PART',costEachMinor:'9500',currency:'USD'},
 {description:'Welding',basis:'HOURLY_PER_PART',hoursPerPart:'3',rateMinor:'7500',currency:'USD'},
 {description:'Powder',basis:'PER_PART',costEachMinor:'10000',currency:'USD'},
 {description:'Supplier summary',basis:'BATCH_TOTAL',sourceAmountMinor:'235025',allocationQuantity:'18',vendorId:'VND-1',summaryGroupKey:'ONLINE',purpose:'SUPPLIER_SUMMARY',summaryOnly:true,includeInRollup:false,currency:'USD'}
];
const rollup=engine.rollup(lines,'18','1250532','0');
assert.equal(rollup.recurringCostMinor,'1180025');assert.equal(rollup.totalCostMinor,'1180025');assert.equal(rollup.contributionMinor,'70507');
assert.equal(rollup.lines[0].costEachMinor,'6025'); // first detail allocation is display-only
assert.equal(engine.calculateLine({basis:'BATCH_TOTAL',sourceAmountMinor:'235025',allocationQuantity:'18'},'18').costEachMinor,'13057');
assert.equal(engine.reconcileSuppliers(rollup.lines)[0].varianceMinor,'0');
assert.throws(()=>engine.calculateLine({basis:'PER_PART',costEachMinor:'100'},'1.00001'),e=>/4 decimal/.test(e.message));
const nullRepo={byField:()=>[],create:x=>x};const quoteProjection=new c.QuoteCostingService_({estimates:nullRepo,lines:nullRepo,pricing:nullRepo,documents:nullRepo}).customerProjection({id:'Q1',status:'Draft'},{id:'R1',revision:1,status:'DRAFT'},[{description:'Part',quantity:'18',unitPriceMinor:'69474',extendedPriceMinor:'1250532'}]);
const serialized=JSON.stringify(quoteProjection);['vendorId','internalNotes','margin','costBasisMinor','1180025'].forEach(secret=>assert.equal(serialized.includes(secret),false));

function memory(rows=[]){return {rows,create(x){this.rows.push(x);return x},get(id){return this.rows.find(x=>x.id===id)},forTenant(t){return this.rows.filter(x=>x.tenantId===t)},byField(t,f,v,l){return this.rows.filter(x=>x.tenantId===t&&x[f]===v).slice(0,l)},search(t,q,l){return this.rows.filter(x=>x.tenantId===t&&x.name.toLowerCase().includes(String(q).toLowerCase())).slice(0,l)}}}
const vendors=memory(),caps=memory(),locations=memory(),contacts=memory(),estimates=memory();const service=new c.VendorService_({vendors,capabilities:caps,locations,contacts,estimates,uuid:()=>String(++seq),clock:()=>new Date('2026-08-12')});
service.create({name:'OnlineMetals',supplyType:'GOODS',capabilities:['MATERIAL_SUPPLIER','TOOLING_SUPPLIER']},{tenantId:'T1',userId:'U1',operationId:'OP1',requestFingerprint:'FP'},'V1');
service.create({name:'Weld Co',supplyType:'SERVICES',capabilities:['WELDING_FABRICATION']},{tenantId:'T2',userId:'U2',operationId:'OP2',requestFingerprint:'FP2'},'V2');
assert.equal(service.search('Online',{tenantId:'T1'},50)[0].label,'OnlineMetals');assert.equal(service.search('',{tenantId:'T1'},50).length,1);assert.equal(caps.rows.length,3);
console.log('MOS-126B+C Vendor and exact Quote costing tests passed');
