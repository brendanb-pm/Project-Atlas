/** Bounded, ADMIN_CONFIG-only activation for basic Follow-Ups. */
function initializeFollowUpPersistence() {
  return callable_('initializeFollowUpPersistence','ADMINISTRATIVE',function(){return initializeFollowUpPersistence_();},null,null,securityOperationOptions_('initializeFollowUpPersistence','Configuration','FollowUpPersistence',{version:1}));
}

function initializeFollowUpPersistence_() {
  var config=getCoreFollowUpStorageConfig_(),spreadsheet=SpreadsheetApp.openById(config.spreadsheetId);
  return initializeMappedSheets_(spreadsheet,[config.mappings.followUps,config.mappings.events]);
}

/** Bounded, ADMIN_CONFIG-only activation for the explicitly configured purchase store. */
function initializePurchaseApprovalPersistence() {
  return callable_('initializePurchaseApprovalPersistence','ADMINISTRATIVE',function(){return initializePurchaseApprovalPersistence_();},null,null,securityOperationOptions_('initializePurchaseApprovalPersistence','Configuration','PurchaseApprovalPersistence',{version:1}));
}

function initializePurchaseApprovalPersistence_() {
  var config=getPurchaseApprovalConfig_(),spreadsheet=SpreadsheetApp.openById(config.spreadsheetId);
  return initializeMappedSheets_(spreadsheet,[config.mapping],{PurchaseApproval:VMOS_PURCHASE_APPROVAL_FIELDS});
}

function initializeMappedSheets_(spreadsheet,mappings,fieldOrderByEntity) {
  var plans=mappings.map(function(mapping){
    var fieldOrder=fieldOrderByEntity&&fieldOrderByEntity.PurchaseApproval;
    var headers=mappedActivationHeaders_(mapping,fieldOrder),sheet=spreadsheet.getSheetByName(mapping.sheetName);
    if(sheet){
      var actual=sheet.getLastColumn()?sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0]:[];
      if(!sameActivationHeaders_(actual,headers))throw new VmosConfigurationError_('Configured sheet already exists with incompatible headers. No changes were made.');
    }
    return {mapping:mapping,headers:headers,sheet:sheet};
  });
  var results=plans.map(function(plan){
    var created=false,sheet=plan.sheet;
    if(!sheet){sheet=spreadsheet.insertSheet(plan.mapping.sheetName);sheet.getRange(1,1,1,plan.headers.length).setValues([plan.headers]);created=true;}
    var rowCount=Math.max(0,Number(sheet.getLastRow()||0)-1);
    return {sheetName:plan.mapping.sheetName,created:created,recordCount:rowCount};
  });
  return {ok:true,sheets:results};
}

function mappedActivationHeaders_(mapping,fieldOrder) {
  var fields=fieldOrder||Object.keys(mapping.fields||{}),headers=fields.map(function(field){
    var aliases=mapping.fields&&mapping.fields[field];
    if(!Array.isArray(aliases)||!aliases.length||!String(aliases[0]||'').trim())throw new VmosConfigurationError_('Configured persistence mapping is incomplete. No changes were made.');
    return String(aliases[0]);
  });
  var seen={};headers.forEach(function(header){if(seen[header])throw new VmosConfigurationError_('Configured persistence headers must be unique. No changes were made.');seen[header]=true;});
  if(headers.indexOf(mapping.idField)===-1)throw new VmosConfigurationError_('Configured persistence ID header is missing. No changes were made.');
  return headers;
}

function sameActivationHeaders_(actual,expected) {
  if(actual.length!==expected.length)return false;
  for(var index=0;index<expected.length;index+=1)if(actual[index]!==expected[index])return false;
  return true;
}
