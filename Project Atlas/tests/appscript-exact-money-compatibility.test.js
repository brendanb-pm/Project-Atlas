'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const compatibility=require('../tools/check-appscript-compatibility');
const root=path.join(__dirname,'..','appscript','src');
function E(message){this.message=message;this.code='VALIDATION_ERROR';} E.prototype=Object.create(Error.prototype);
const context=vm.createContext({String,Number,Boolean,Date,Object,Array,Math,JSON,VmosValidationError_:E,VmosAuthorizationError_:E,VmosConflictError:E,Utilities:{getUuid:()=> 'UUID'}});
vm.runInContext(fs.readFileSync(path.join(root,'ConfigQuoteCosting.gs'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'Services','QuoteCostingService.gs'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'Services','QuoteRevisionService.gs'),'utf8'),context);

assert.deepEqual(compatibility.check(),[],'production Apps Script source must pass the target compatibility gate');
assert(compatibility.unsupported('var amount=0n;','fixture.gs').some(x=>x.label==='BigInt literal'));
assert(compatibility.unsupported('var amount=BigInt("0");','fixture.gs').some(x=>x.label==='BigInt constructor'));
assert(compatibility.unsupported('const fs=require("fs");','fixture.gs').some(x=>x.label==='Node CommonJS/runtime API'));

const engine=new context.QuoteCostEngine_();
assert.equal(engine.calculateLine({basis:'HOURLY_PER_PART',rateMinor:'100',hoursPerPart:'0.3333'},'3').extendedCostMinor,'100');
assert.equal(engine.calculateLine({basis:'HOURLY_PER_PART',rateMinor:'100',hoursPerPart:'0.3333'},'10000').extendedCostMinor,'333300');
assert.equal(engine.calculateLine({basis:'PER_PART',costEachMinor:'1'},'0.4999').extendedCostMinor,'0');
assert.equal(engine.calculateLine({basis:'PER_PART',costEachMinor:'1'},'0.5').extendedCostMinor,'1');
assert.equal(engine.calculateLine({basis:'PER_PART',costEachMinor:'1'},'1.5').extendedCostMinor,'2');
assert.equal(engine.calculateLine({basis:'PER_PART',costEachMinor:'999999999999999999999999'},'9999.9999').extendedCostMinor,'9999999899999999999999990000');
assert.equal(engine.calculateLine({basis:'BATCH_TOTAL',sourceAmountMinor:'999999999999999999999999',allocationQuantity:'3'},'3').costEachMinor,'333333333333333333333333');
assert.equal(engine.rollup([{basis:'ONE_TIME',sourceAmountMinor:'101'}],'1','100','0').contributionMinor,'-1');
assert.equal(engine.reconcileSuppliers([{vendorId:'V1',currency:'USD',summaryGroupKey:'S',purpose:'INTERNAL_COST_DETAIL',includeInRollup:true,extendedCostMinor:'101'},{vendorId:'V1',currency:'USD',summaryGroupKey:'S',purpose:'SUPPLIER_SUMMARY',includeInRollup:false,extendedCostMinor:'100'}])[0].varianceMinor,'-1');

const vmcLines=[
 {basis:'BATCH_TOTAL',sourceAmountMinor:'108452',allocationQuantity:'18',vendorId:'V1',summaryGroupKey:'ONLINE',currency:'USD'},
 {basis:'BATCH_TOTAL',sourceAmountMinor:'60080',allocationQuantity:'18',vendorId:'V1',summaryGroupKey:'ONLINE',currency:'USD'},
 {basis:'BATCH_TOTAL',sourceAmountMinor:'47286',allocationQuantity:'18',vendorId:'V1',summaryGroupKey:'ONLINE',currency:'USD'},
 {basis:'BATCH_TOTAL',sourceAmountMinor:'19207',allocationQuantity:'18',vendorId:'V1',summaryGroupKey:'ONLINE',currency:'USD'},
 {basis:'PER_PART',costEachMinor:'1000'},{basis:'PER_PART',costEachMinor:'9500'},{basis:'PER_PART',costEachMinor:'9500'},
 {basis:'HOURLY_PER_PART',hoursPerPart:'3',rateMinor:'7500'},{basis:'PER_PART',costEachMinor:'10000'},
 {basis:'BATCH_TOTAL',sourceAmountMinor:'235025',allocationQuantity:'18',vendorId:'V1',summaryGroupKey:'ONLINE',purpose:'SUPPLIER_SUMMARY',summaryOnly:true,includeInRollup:false,currency:'USD'}
];
const vmc=engine.rollup(vmcLines,'18','1250532','0');
assert.deepEqual([vmc.recurringCostMinor,vmc.totalCostMinor,vmc.customerTotalMinor,vmc.contributionMinor],['1180025','1180025','1250532','70507']);
assert.equal(engine.calculateLine({basis:'BATCH_TOTAL',sourceAmountMinor:'235025',allocationQuantity:'18'},'18').costEachMinor,'13057');
assert.equal(engine.reconcileSuppliers(vmc.lines)[0].varianceMinor,'0');

const revisions=Object.create(context.QuoteRevisionService_.prototype);
assert.deepEqual(JSON.parse(JSON.stringify(revisions.totals_([{unitPriceMinor:'999999999999999999999999',quantity:'2.5',extendedPriceMinor:'2499999999999999999999998',lineType:'RECURRING'},{unitPriceMinor:'1',quantity:'0.5',extendedPriceMinor:'1',lineType:'ONE_TIME'}]))),{recurring:'2499999999999999999999998',oneTime:'1',total:'2499999999999999999999999'});
console.log('Apps Script-compatible exact money and VMC-0128 regression tests passed');
