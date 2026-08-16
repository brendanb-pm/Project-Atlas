const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const base=path.join(__dirname,'..','appscript','src');

function sheet(name,headers,records){
  const rows=headers?[headers.slice(),...(records||[])]:[[]];
  return {name,rows,getLastColumn:()=>rows[0].length,getLastRow:()=>rows.length,getRange(row,column,rowCount,columnCount){return {setValues(values){values.forEach((valuesRow,r)=>valuesRow.forEach((value,c)=>{(rows[row-1+r]||(rows[row-1+r]=[]))[column-1+c]=value;}));},getDisplayValues(){return Array.from({length:rowCount},(_,r)=>Array.from({length:columnCount},(_,c)=>String((rows[row-1+r]||[])[column-1+c]||'')));}};}};
}
function workbook(existing){
  const sheets=existing||{};
  return {sheets,getSheetByName:name=>sheets[name]||null,insertSheet(name){assert(!sheets[name]);return sheets[name]=sheet(name);}};
}
const context=vm.createContext({console,Array,Object,String,Number,JSON,Math,VmosConfigurationError_:function(message){this.message=message;},securityOperationOptions_:()=>({}),callable_:(name,policy,operation)=>operation(),SpreadsheetApp:{openById:()=>context.book}});
['ConfigFollowUpCalendar.gs','Utilities/PurchaseApprovalConfig.gs','Utilities/ActivationPersistence.gs'].forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file}));

context.getVmosConfig_=()=>({spreadsheetId:'configured-workbook'});
context.PropertiesService={getScriptProperties:()=>({getProperty:key=>({
  VMOS_PURCHASE_APPROVAL_MAPPING:JSON.stringify({sheetName:'PurchaseRequests',idField:'Purchase Request ID',fields:{id:['Purchase Request ID'],requestDate:['Request Date'],requester:['Requester'],vendorId:['Vendor ID'],vendor:['Vendor'],jobId:['Job ID'],category:['Category'],classification:['Classification'],businessJustification:['Business Justification'],expectedRoiNeed:['Expected ROI / Need'],description:['Description'],amount:['Amount'],actualPurchaseAmount:['Actual Purchase Amount'],status:['Status'],approvalRequired:['Approval Required'],approver:['Approver'],approvedAt:['Approved At'],receiptReference:['Receipt Reference'],notes:['Notes'],createdAt:['Created At'],updatedAt:['Updated At'],createdBy:['Created By'],updatedBy:['Updated By'],securityOperationId:['Security Operation ID'],securityOperationFingerprint:['Security Operation Fingerprint'],securityTenantId:['Security Tenant ID'],securityActorId:['Security Actor ID']}}),
  VMOS_PURCHASE_APPROVAL_THRESHOLD:'500'
}[key]||null)})};

context.book=workbook();
const follow=context.initializeFollowUpPersistence();
assert.deepEqual(follow,{ok:true,sheets:[{sheetName:'FollowUps',created:true,recordCount:0},{sheetName:'FollowUpEvents',created:true,recordCount:0}]});
assert.deepEqual(context.book.sheets.FollowUps.rows[0],['FollowUpID','CustomerID','SalesActivityID','Title','Due At','Start At','End At','Time Zone','Owner User ID','Status','Version','Created At','Updated At','Completed At','Cancelled At']);
assert.deepEqual(context.book.sheets.FollowUpEvents.rows[0],['FollowUpEventID','FollowUpID','Event Type','Occurred At','Actor','Correlation ID','Previous Version','New Version','Details']);
assert.deepEqual(context.initializeFollowUpPersistence().sheets.map(item=>item.created),[false,false],'repeated activation is non-destructive');

context.book=workbook({FollowUps:sheet('FollowUps',['Wrong Header'])});
assert.throws(()=>context.initializeFollowUpPersistence(),error=>/incompatible headers/.test(error.message));
assert.equal(context.book.sheets.FollowUpEvents,undefined,'preflight prevents partial creation when an existing schema conflicts');
assert.deepEqual(context.book.sheets.FollowUps.rows,[['Wrong Header']]);

context.book=workbook();
const purchase=context.initializePurchaseApprovalPersistence();
assert.deepEqual(purchase,{ok:true,sheets:[{sheetName:'PurchaseRequests',created:true,recordCount:0}]});
assert.deepEqual(context.book.sheets.PurchaseRequests.rows[0],context.VMOS_PURCHASE_APPROVAL_FIELDS.map(field=>JSON.parse(context.PropertiesService.getScriptProperties().getProperty('VMOS_PURCHASE_APPROVAL_MAPPING')).fields[field][0]));
assert.equal(context.book.sheets.PurchaseRequests.rows.length,1,'initializer seeds no business records');

context.book=workbook({PurchaseRequests:sheet('PurchaseRequests',['Purchase Request ID'],[['PUR-EXISTING']])});
assert.throws(()=>context.initializePurchaseApprovalPersistence(),error=>/incompatible headers/.test(error.message));
assert.deepEqual(context.book.sheets.PurchaseRequests.rows,[['Purchase Request ID'],['PUR-EXISTING']],'conflicting existing data remains unchanged');

const registry=fs.readFileSync(path.join(base,'Services','EndpointAuthorizationRegistry.gs'),'utf8');
assert.match(registry,/initializeFollowUpPersistence:\{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'\}/);
assert.match(registry,/initializePurchaseApprovalPersistence:\{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'\}/);
console.log('Atlas bounded Follow-Up and purchasing activation persistence tests passed');
