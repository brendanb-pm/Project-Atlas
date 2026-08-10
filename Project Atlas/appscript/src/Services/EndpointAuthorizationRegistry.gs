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
  getMvpBootstrap:{kind:'READ',capability:'CORE_RECORD_READ'}, createMvpRecord:{kind:'WRITE',capability:'CORE_RECORD_WRITE'},
  updateMvpRecord:{kind:'WRITE',capability:'CORE_RECORD_WRITE'}, configureShopFloorJob:{kind:'ADMINISTRATIVE',capability:'OPERATIONS_WRITE'},
  resolveShopJobByQr:{kind:'READ',capability:'OPERATIONS_READ'}, getShopFloorJob:{kind:'READ',capability:'OPERATIONS_READ'},
  transitionShopFloorJob:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'}, reportJobProblem:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'},
  resolveJobBlock:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'}, listJobEvents:{kind:'READ',capability:'OPERATIONS_READ'},
  getTravelerPrintData:{kind:'READ',capability:'OPERATIONS_READ'}, getShopDashboard:{kind:'READ',capability:'OPERATIONS_READ'},
  getShopOperatorWorkloads:{kind:'READ',capability:'OPERATIONS_READ'}, listIdeas:{kind:'READ',capability:'CORE_RECORD_READ'},
  captureIdea:{kind:'WRITE',capability:'CORE_RECORD_WRITE'}, requestIdeaPromotion:{kind:'HIGH_RISK_WRITE',capability:'CORE_RECORD_WRITE'},
  recordProcessTrial:{kind:'WRITE',capability:'OPERATIONS_WRITE'}, listProcessTrials:{kind:'READ',capability:'OPERATIONS_READ'},
  recordCashReceipt:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'}, depositCashReceipt:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'},
  getUndepositedPaymentSummary:{kind:'READ',capability:'FINANCE_READ'}, submitPurchaseRequest:{kind:'WRITE',capability:'PURCHASE_REQUEST'},
  approvePurchaseRequest:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_APPROVE'}, recordPurchaseReceipt:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_REQUEST'}
};
function executeCallable_(endpointName,abusePolicy,operation,abuseKey) {
  var policy=ATLAS_CALLABLE_ENDPOINTS[endpointName];
  if(!policy)throw new VmosAuthorizationError('Callable operation is not classified.');
  enforceAbuseControl_(endpointName,abusePolicy,abuseKey);
  return authorizedExecute_(policy.capability,endpointName,operation);
}
