/** Machine-verifiable classification for every callable operation in UI/Code.gs. */
var ATLAS_CALLABLE_ENDPOINTS = {
  createSalesActivity:{kind:'WRITE',capability:'SALES_WRITE'}, updateSalesActivity:{kind:'WRITE',capability:'SALES_WRITE'},
  getSalesActivityTimeline:{kind:'READ',capability:'SALES_READ'}, getSalesFollowUpQueue:{kind:'READ',capability:'SALES_READ'},
  getSalesAccountHealth:{kind:'READ',capability:'SALES_READ'}, getSalesActivityMetrics:{kind:'READ',capability:'SALES_READ'},
  createFollowUp:{kind:'WRITE',capability:'FOLLOWUP_WRITE'}, rescheduleFollowUp:{kind:'WRITE',capability:'FOLLOWUP_WRITE'},
  scheduleFollowUp:{kind:'WRITE',capability:'FOLLOWUP_WRITE'}, reassignFollowUp:{kind:'HIGH_RISK_WRITE',capability:'FOLLOWUP_REASSIGN'},
  getCalendarWorkspace:{kind:'READ',capability:'FOLLOWUP_READ'}, disconnectCalendarConnection:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_USE'},
  retryCalendarConnection:{kind:'WRITE',capability:'CALENDAR_USE'}, resolveCalendarExternalChange:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_RECONCILE'},
  retryCalendarCleanup:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_RECONCILE'}, acknowledgeCalendarCleanup:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_RECONCILE'},
  completeFollowUp:{kind:'HIGH_RISK_WRITE',capability:'FOLLOWUP_WRITE'}, cancelFollowUp:{kind:'HIGH_RISK_WRITE',capability:'FOLLOWUP_WRITE'},
  getMvpBootstrap:{kind:'READ',capability:'CORE_RECORD_READ'}, createMvpRecord:{kind:'WRITE',capability:'DYNAMIC_MVP'},
  updateMvpRecord:{kind:'WRITE',capability:'DYNAMIC_MVP'}, approveQuote:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_APPROVE'},
  issueQuote:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_ISSUE'}, configureShopFloorJob:{kind:'ADMINISTRATIVE',capability:'OPERATIONS_WRITE'},
  resolveShopJobByQr:{kind:'READ',capability:'OPERATIONS_READ'}, getShopFloorJob:{kind:'READ',capability:'OPERATIONS_READ'},
  transitionShopFloorJob:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'}, reportJobProblem:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'},
  resolveJobBlock:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'}, listJobEvents:{kind:'READ',capability:'OPERATIONS_READ'},
  getTravelerPrintData:{kind:'READ',capability:'OPERATIONS_READ'}, getShopDashboard:{kind:'READ',capability:'OPERATIONS_READ'},
  getShopOperatorWorkloads:{kind:'READ',capability:'OPERATIONS_READ'}, listIdeas:{kind:'READ',capability:'CORE_RECORD_READ'},
  captureIdea:{kind:'WRITE',capability:'CORE_RECORD_WRITE'}, requestIdeaPromotion:{kind:'HIGH_RISK_WRITE',capability:'CORE_RECORD_WRITE'},
  recordProcessTrial:{kind:'WRITE',capability:'OPERATIONS_WRITE'}, listProcessTrials:{kind:'READ',capability:'OPERATIONS_READ'},
  recordCashReceipt:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'}, depositCashReceipt:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'},
  getUndepositedPaymentSummary:{kind:'READ',capability:'FINANCE_READ'}, submitPurchaseRequest:{kind:'WRITE',capability:'PURCHASE_REQUEST'},
  approvePurchaseRequest:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_APPROVE'}, recordPurchaseReceipt:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_REQUEST'},
  initializeIdeasPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'}, initializeShopOperationalPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'},
  doGet:{kind:'READ_ONLY',capability:null}
};
var ATLAS_MVP_ENTITY_CAPABILITIES={Customer:{read:'CORE_RECORD_READ',write:'CORE_RECORD_WRITE'},RFQ:{read:'RFQ_READ',write:'RFQ_WRITE'},Quote:{read:'RFQ_READ',write:'QUOTE_WRITE'},Job:{read:'OPERATIONS_READ',write:'OPERATIONS_WRITE'},Invoice:{read:'FINANCE_READ',write:'FINANCE_WRITE'}};
function getMvpEntityCapability_(entity,access) {var policy=ATLAS_MVP_ENTITY_CAPABILITIES[entity];if(!policy)throw new VmosValidationError('Unsupported entity.');return policy[access];}
function executeCallable_(endpointName,abusePolicy,operation,abuseKey,capabilityOverride) {
  var policy=ATLAS_CALLABLE_ENDPOINTS[endpointName];
  if(!policy)throw new VmosAuthorizationError('Callable operation is not classified.');
  enforceAbuseControl_(endpointName,abusePolicy,abuseKey);
  var capability=typeof capabilityOverride==='function'?capabilityOverride():capabilityOverride||policy.capability;
  if(capability==='DYNAMIC_MVP')throw new VmosAuthorizationError('Domain capability was not resolved.');
  return authorizedExecute_(capability,endpointName,operation,{auditRequired:policy.kind!=='READ'&&policy.kind!=='READ_ONLY'});
}
