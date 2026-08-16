/** Machine-verifiable classification for every callable operation in UI/Code.gs. */
var ATLAS_CALLABLE_ENDPOINTS = {
  getAtlasSignInConfiguration:{kind:'PUBLIC_AUTH',capability:null},
  beginAtlasSignIn:{kind:'PUBLIC_AUTH',capability:null},
  abortAtlasSignIn:{kind:'PUBLIC_AUTH',capability:null},
  completeAtlasSignIn:{kind:'PUBLIC_AUTH',capability:null},
  getAtlasSessionStatus:{kind:'PUBLIC_AUTH',capability:null},
  selectAtlasSessionTenant:{kind:'PUBLIC_AUTH',capability:null},
  logoutAtlasSession:{kind:'PUBLIC_AUTH',capability:null},
  getAtlasNavigation:{kind:'READ',capability:null},
  getJobCanvas:{kind:'READ',capability:'OPERATIONS_READ'},
  getCommandCenterWorkspace:{kind:'READ',capability:null},
  searchAtlasCommand:{kind:'READ',capability:null},
  getAtlasActivationHealth:{kind:'READ',capability:'ADMIN_CONFIG'},
  getAdminWorkspace:{kind:'READ',capability:'ADMIN_CONFIG'}, getAdminIdentityWorkspace:{kind:'READ',capability:'ADMIN_IDENTITY'}, getTenantOperationalAdminWorkspace:{kind:'READ',capability:'ADMIN_IDENTITY'}, inviteTenantUser:{kind:'ADMINISTRATIVE',capability:'ADMIN_IDENTITY'}, updateTenantMembership:{kind:'ADMINISTRATIVE',capability:'ADMIN_IDENTITY'}, getPlatformCommercialWorkspace:{kind:'READ',capability:'PLATFORM_TENANT_READ'},
  getCommercialWorkflowWorkspace:{kind:'READ',capability:'DYNAMIC_MVP'}, createContextualRfq:{kind:'WRITE',capability:'RFQ_WRITE'}, createQuoteFromRfq:{kind:'WRITE',capability:'QUOTE_WRITE'}, acceptQuote:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_APPROVE'}, convertQuoteToJob:{kind:'HIGH_RISK_WRITE',capability:'OPERATIONS_WRITE'}, createInvoiceFromJob:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'}, recordInvoicePayment:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'}, reconcileInvoicePaymentAttempt:{kind:'READ',capability:'FINANCE_WRITE'}, getPurchasingWorkspace:{kind:'READ',capability:'PURCHASE_REQUEST'}, searchPurchasingVendors:{kind:'READ',capability:'PURCHASE_REQUEST'}, associatePurchaseRequestVendor:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_REQUEST'},
  searchVendors:{kind:'READ',capability:'QUOTE_COST_READ'}, getVendorWorkspace:{kind:'READ',capability:'QUOTE_COST_READ'}, createVendor:{kind:'WRITE',capability:'QUOTE_COST_WRITE'}, getQuoteBuilderWorkspace:{kind:'READ',capability:'QUOTE_WRITE'}, getQuoteRevisionWorkspace:{kind:'READ',capability:'QUOTE_WRITE'}, saveQuoteRevisionDraft:{kind:'WRITE',capability:'QUOTE_WRITE'}, issueQuoteRevision:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_ISSUE'}, acceptQuoteRevision:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_APPROVE'}, getCustomerQuoteOutput:{kind:'READ',capability:'RFQ_READ'}, searchQuoteBuilderRecords:{kind:'READ',capability:'QUOTE_WRITE'}, getQuoteSourceDocumentLinks:{kind:'READ',capability:'QUOTE_COST_READ'}, searchQuoteSourceDocuments:{kind:'READ',capability:'QUOTE_COST_READ'}, searchQuoteSourceTargets:{kind:'READ',capability:'QUOTE_COST_READ'}, addQuoteSourceDocumentLink:{kind:'WRITE',capability:'QUOTE_COST_WRITE'}, removeQuoteSourceDocumentLink:{kind:'WRITE',capability:'QUOTE_COST_WRITE'}, saveQuoteCostEstimate:{kind:'WRITE',capability:'QUOTE_COST_WRITE'},
  createSalesActivity:{kind:'WRITE',capability:'SALES_WRITE'}, updateSalesActivity:{kind:'WRITE',capability:'SALES_WRITE'},
  getSalesActivityTimeline:{kind:'READ',capability:'SALES_READ'}, getSalesFollowUpQueue:{kind:'READ',capability:'SALES_READ'},
  getSalesCustomerDirectory:{kind:'READ',capability:'SALES_READ'}, getSalesCustomerWorkspace:{kind:'READ',capability:'SALES_READ'},
  getSalesAccountHealth:{kind:'READ',capability:'SALES_READ'}, getSalesActivityMetrics:{kind:'READ',capability:'SALES_READ'},
  createFollowUp:{kind:'WRITE',capability:'FOLLOWUP_WRITE'}, rescheduleFollowUp:{kind:'WRITE',capability:'FOLLOWUP_WRITE'},
  scheduleFollowUp:{kind:'WRITE',capability:'FOLLOWUP_WRITE'}, reassignFollowUp:{kind:'HIGH_RISK_WRITE',capability:'FOLLOWUP_REASSIGN'},
  getCalendarWorkspace:{kind:'READ',capability:'FOLLOWUP_READ'}, searchFollowUpOwners:{kind:'READ',capability:'FOLLOWUP_REASSIGN'}, disconnectCalendarConnection:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_USE'},
  retryCalendarConnection:{kind:'WRITE',capability:'CALENDAR_USE'}, resolveCalendarExternalChange:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_RECONCILE'},
  retryCalendarCleanup:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_RECONCILE'}, acknowledgeCalendarCleanup:{kind:'HIGH_RISK_WRITE',capability:'CALENDAR_RECONCILE'},
  completeFollowUp:{kind:'HIGH_RISK_WRITE',capability:'FOLLOWUP_WRITE'}, cancelFollowUp:{kind:'HIGH_RISK_WRITE',capability:'FOLLOWUP_WRITE'},
  getMvpBootstrap:{kind:'READ',capability:'CORE_RECORD_READ'}, createMvpRecord:{kind:'WRITE',capability:'DYNAMIC_MVP'},
  updateMvpRecord:{kind:'WRITE',capability:'DYNAMIC_MVP'}, approveQuote:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_APPROVE'},
  issueQuote:{kind:'HIGH_RISK_WRITE',capability:'QUOTE_ISSUE'}, configureShopFloorJob:{kind:'ADMINISTRATIVE',capability:'OPERATIONS_WRITE'},
  resolveShopJobByQr:{kind:'READ',capability:'OPERATIONS_READ'}, getShopFloorJob:{kind:'READ',capability:'OPERATIONS_READ'},
  getShopFloorWorkspace:{kind:'READ',capability:'OPERATIONS_READ'},
  transitionShopFloorJob:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'}, reportJobProblem:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'},
  resolveJobBlock:{kind:'HIGH_RISK_WRITE',capability:'SHOP_FLOOR_OPERATE'}, listJobEvents:{kind:'READ',capability:'OPERATIONS_READ'},
  getTravelerPrintData:{kind:'READ',capability:'OPERATIONS_READ'}, getShopDashboard:{kind:'READ',capability:'OPERATIONS_READ'},
  getShopOperatorWorkloads:{kind:'READ',capability:'OPERATIONS_READ'}, getFloorBoard:{kind:'READ',capability:'OPERATIONS_READ'}, listIdeas:{kind:'READ',capability:'CORE_RECORD_READ'},
  getDailyProductionBoard:{kind:'READ',capability:'OPERATIONS_READ'}, updateDailyProductionJob:{kind:'HIGH_RISK_WRITE',capability:'OPERATIONS_WRITE'},
  captureIdea:{kind:'WRITE',capability:'CORE_RECORD_WRITE'}, requestIdeaPromotion:{kind:'HIGH_RISK_WRITE',capability:'CORE_RECORD_WRITE'},
  recordProcessTrial:{kind:'WRITE',capability:'OPERATIONS_WRITE'}, listProcessTrials:{kind:'READ',capability:'OPERATIONS_READ'},
  recordCashReceipt:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'}, depositCashReceipt:{kind:'HIGH_RISK_WRITE',capability:'FINANCE_WRITE'},
  getUndepositedPaymentSummary:{kind:'READ',capability:'FINANCE_READ'}, getPurchaseRequestsForJob:{kind:'READ',capability:null}, submitPurchaseRequest:{kind:'WRITE',capability:'PURCHASE_REQUEST'},
  approvePurchaseRequest:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_APPROVE'}, recordPurchaseReceipt:{kind:'HIGH_RISK_WRITE',capability:'PURCHASE_REQUEST'},
  getFirearmsWorkspace:{kind:'READ',capability:'FIREARMS_READ'}, searchFirearmsRelationships:{kind:'READ',capability:'FIREARMS_READ'}, intakeSerializedFirearm:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_WRITE'}, assignFirearmToJob:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_WRITE'}, moveFirearmCustody:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_CUSTODY'}, disposeSerializedFirearm:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_DISPOSE'}, correctSerializedFirearm:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_CORRECT'}, correctSerializedFirearmField:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_CORRECT'}, reconcileSerializedFirearm:{kind:'HIGH_RISK_WRITE',capability:'FIREARMS_RECONCILE'}, exportSerializedFirearms:{kind:'READ',capability:'FIREARMS_READ'},
  initializeIdeasPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'}, initializeShopOperationalPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'},
  initializeFollowUpPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'}, initializePurchaseApprovalPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'}, initializeFirearmsPersistence:{kind:'ADMINISTRATIVE',capability:'ADMIN_CONFIG'},
  doGet:{kind:'READ_ONLY',capability:null}
};
var ATLAS_MVP_ENTITY_CAPABILITIES={Customer:{read:'CORE_RECORD_READ',write:'CORE_RECORD_WRITE'},RFQ:{read:'RFQ_READ',write:'RFQ_WRITE'},Quote:{read:'RFQ_READ',write:'QUOTE_WRITE'},Job:{read:'OPERATIONS_READ',write:'OPERATIONS_WRITE'},Invoice:{read:'FINANCE_READ',write:'FINANCE_WRITE'}};
var ATLAS_MUTATION_RECOVERY = {
  createSalesActivity:'PREALLOCATED_RESOURCE_ID',updateSalesActivity:'EXPLICIT_REVIEW',
  createFollowUp:'DOMAIN_SPECIFIC_RECOVERY',rescheduleFollowUp:'DOMAIN_SPECIFIC_RECOVERY',scheduleFollowUp:'DOMAIN_SPECIFIC_RECOVERY',reassignFollowUp:'DOMAIN_SPECIFIC_RECOVERY',
  disconnectCalendarConnection:'EXPLICIT_REVIEW',retryCalendarConnection:'EXPLICIT_REVIEW',resolveCalendarExternalChange:'EXPLICIT_REVIEW',retryCalendarCleanup:'EXPLICIT_REVIEW',acknowledgeCalendarCleanup:'EXPLICIT_REVIEW',completeFollowUp:'DOMAIN_SPECIFIC_RECOVERY',cancelFollowUp:'DOMAIN_SPECIFIC_RECOVERY',
  createMvpRecord:'PREALLOCATED_RESOURCE_ID',updateMvpRecord:'EXPLICIT_REVIEW',approveQuote:'EXPLICIT_REVIEW',issueQuote:'EXPLICIT_REVIEW',
  intakeSerializedFirearm:'PREALLOCATED_RESOURCE_ID',assignFirearmToJob:'EXPLICIT_REVIEW',moveFirearmCustody:'EXPLICIT_REVIEW',disposeSerializedFirearm:'EXPLICIT_REVIEW',correctSerializedFirearm:'EXPLICIT_REVIEW',correctSerializedFirearmField:'EXPLICIT_REVIEW',reconcileSerializedFirearm:'EXPLICIT_REVIEW',
  inviteTenantUser:'EXPLICIT_REVIEW',updateTenantMembership:'EXPLICIT_REVIEW',recordInvoicePayment:'COMMAND_IDEMPOTENCY_KEY_LOOKUP',
  createContextualRfq:'PREALLOCATED_RESOURCE_ID',createQuoteFromRfq:'PREALLOCATED_RESOURCE_ID',acceptQuote:'EXPLICIT_REVIEW',convertQuoteToJob:'PREALLOCATED_RESOURCE_ID',createInvoiceFromJob:'PREALLOCATED_RESOURCE_ID',
  createVendor:'PREALLOCATED_RESOURCE_ID',saveQuoteRevisionDraft:'DOMAIN_SPECIFIC_RECOVERY',issueQuoteRevision:'DOMAIN_SPECIFIC_RECOVERY',acceptQuoteRevision:'DOMAIN_SPECIFIC_RECOVERY',addQuoteSourceDocumentLink:'PREALLOCATED_RESOURCE_ID',removeQuoteSourceDocumentLink:'EXPLICIT_REVIEW',saveQuoteCostEstimate:'DOMAIN_SPECIFIC_RECOVERY',
  configureShopFloorJob:'DOMAIN_SPECIFIC_RECOVERY',transitionShopFloorJob:'DOMAIN_SPECIFIC_RECOVERY',reportJobProblem:'DOMAIN_SPECIFIC_RECOVERY',resolveJobBlock:'DOMAIN_SPECIFIC_RECOVERY',
  updateDailyProductionJob:'EXPLICIT_REVIEW',
  captureIdea:'DOMAIN_SPECIFIC_RECOVERY',requestIdeaPromotion:'DOMAIN_SPECIFIC_RECOVERY',recordProcessTrial:'PREALLOCATED_RESOURCE_ID',
  recordCashReceipt:'COMMAND_IDEMPOTENCY_KEY_LOOKUP',depositCashReceipt:'EXPLICIT_REVIEW',submitPurchaseRequest:'PREALLOCATED_RESOURCE_ID',associatePurchaseRequestVendor:'EXPLICIT_REVIEW',approvePurchaseRequest:'EXPLICIT_REVIEW',recordPurchaseReceipt:'EXPLICIT_REVIEW',
  initializeIdeasPersistence:'BLOCKED_FROM_WRITABLE_PRODUCTION',initializeShopOperationalPersistence:'BLOCKED_FROM_WRITABLE_PRODUCTION',
  initializeFollowUpPersistence:'EXPLICIT_REVIEW',initializePurchaseApprovalPersistence:'EXPLICIT_REVIEW',initializeFirearmsPersistence:'EXPLICIT_REVIEW'
};
function getMvpEntityCapability_(entity,access) {var policy=ATLAS_MVP_ENTITY_CAPABILITIES[entity];if(!policy)throw new VmosValidationError_('Unsupported entity.');return policy[access];}
function securityOperationOptions_(operation,resourceType,resourceId,parts,recoveryType,recoveryContext){var serialized=JSON.stringify(parts||{}),bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,serialized,Utilities.Charset.UTF_8),digest=bytes.map(function(value){var normalized=value<0?value+256:value;return ('0'+normalized.toString(16)).slice(-2);}).join('');return {idempotencyKey:operation+':'+digest,requestFingerprint:digest,resourceType:resourceType||'',resourceId:resourceId||'',recoveryType:recoveryType||'',recoveryContext:recoveryContext||{}};}
function preallocateSecurityResourceId_(prefix){return prefix+'-'+Utilities.getUuid().toUpperCase();}
function prepareSecurityResource_(options,allocator){options.prepare=function(context){var id=allocator(context);return {resourceId:id,recoveryContext:Object.assign({},options.recoveryContext||{},{resourceId:id})};};return options;}
function executeCallable_(endpointName,abusePolicy,operation,abuseKey,capabilityOverride,operationOptions) {
  var policy=ATLAS_CALLABLE_ENDPOINTS[endpointName];
  if(!policy)throw new VmosAuthorizationError_('Callable operation is not classified.');
  enforceAbuseControl_(endpointName,abusePolicy,abuseKey);
  var capability=typeof capabilityOverride==='function'?capabilityOverride():capabilityOverride||policy.capability;
  if(capability==='DYNAMIC_MVP')throw new VmosAuthorizationError_('Domain capability was not resolved.');
  operationOptions=operationOptions||{};operationOptions.auditRequired=policy.kind!=='READ'&&policy.kind!=='READ_ONLY';
  if(operationOptions.auditRequired){
    var strategy=ATLAS_MUTATION_RECOVERY[endpointName];
    if(!strategy)throw new VmosConfigurationError_('Callable mutation recovery is not classified.');
    operationOptions.recoveryContext=operationOptions.recoveryContext||{};
    operationOptions.recoveryContext.strategy=strategy;
    if(!operationOptions.recoveryType)operationOptions.recoveryType='UNIVERSAL_RESOURCE_PROOF';
  }
  return authorizedExecute_(capability,endpointName,operation,operationOptions);
}
