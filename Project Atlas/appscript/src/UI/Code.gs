function doGet(e) {
  if (e && e.parameter && e.parameter.sales === '1') return HtmlService.createTemplateFromFile('UI/SalesActivity').evaluate().setTitle('VMOS Sales Activity').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (e && e.parameter && e.parameter.ideas === '1') return HtmlService.createTemplateFromFile('UI/Ideas').evaluate().setTitle('VMOS Ideas Backlog').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (e && e.parameter && e.parameter.dashboard === '1') return HtmlService.createTemplateFromFile('UI/OperationsDashboard').evaluate().setTitle('VMOS Operations Dashboard').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (e && e.parameter && e.parameter.traveler === '1') return HtmlService.createTemplateFromFile('UI/Traveler').evaluate().setTitle('VMOS Job Traveler').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (e && e.parameter && e.parameter.shop === '1') return HtmlService.createTemplateFromFile('UI/ShopFloor').evaluate().setTitle('VMOS Shop Floor').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return HtmlService.createTemplateFromFile('UI/Index').evaluate().setTitle('VMOS MVP').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function createSalesActivity(input) { try { return { ok: true, data: createSalesActivityService_().create(input, getVmosAuditUser_()) }; } catch (error) { return toClientError_(error); } }
function updateSalesActivity(id, changes) { try { return { ok: true, data: createSalesActivityService_().update(id, changes, getVmosAuditUser_()) }; } catch (error) { return toClientError_(error); } }
function getSalesActivityTimeline(customerId) { try { return { ok: true, data: createSalesActivityService_().listTimeline(customerId) }; } catch (error) { return toClientError_(error); } }
function getSalesFollowUpQueue() { try { return { ok: true, data: createSalesActivityService_().followUpQueue(new Date()) }; } catch (error) { return toClientError_(error); } }
function getSalesAccountHealth(customerId) { try { return { ok: true, data: createSalesActivityService_().accountFollowUpHealth(customerId, new Date()) }; } catch (error) { return toClientError_(error); } }
function getMvpBootstrap() { try { var data = {}; ['Customer', 'RFQ', 'Quote', 'Job', 'Invoice'].forEach(function (entity) { data[entity] = new MvpService(entity).list(); }); return { ok: true, data: data }; } catch (error) { return toClientError_(error); } }
function createMvpRecord(entity, input) { try { if (['Customer', 'RFQ', 'Quote', 'Job', 'Invoice'].indexOf(entity) === -1) throw new VmosValidationError('Unsupported entity.'); return { ok: true, data: new MvpService(entity).create(input) }; } catch (error) { return toClientError_(error); } }
function updateMvpRecord(entity, id, changes) { try { if (['Customer', 'RFQ', 'Quote', 'Job', 'Invoice'].indexOf(entity) === -1) throw new VmosValidationError('Unsupported entity.'); return { ok: true, data: new MvpService(entity).update(id, changes) }; } catch (error) { return toClientError_(error); } }
function configureShopFloorJob(jobId, workflowId, initialStatus) { try { return { ok: true, data: new ShopFloorService().configureJob(jobId, workflowId, initialStatus) }; } catch (error) { return toClientError_(error); } }
function resolveShopJobByQr(token) { try { return { ok: true, data: new ShopFloorService().resolveByQr(token) }; } catch (error) { return toClientError_(error); } }
function getShopFloorJob(jobId) { try { return { ok: true, data: new ShopFloorService().getJob(jobId) }; } catch (error) { return toClientError_(error); } }
function transitionShopFloorJob(jobId, targetStatus, commandId, notes) { try { return { ok: true, data: new ShopFloorService().transition(jobId, targetStatus, commandId, notes) }; } catch (error) { return toClientError_(error); } }
function reportJobProblem(jobId, payload, commandId) { try { return { ok: true, data: new ShopFloorService().reportProblem(jobId, payload, commandId) }; } catch (error) { return toClientError_(error); } }
function resolveJobBlock(jobId, payload, commandId) { try { return { ok: true, data: new ShopFloorService().resolveBlock(jobId, payload, commandId) }; } catch (error) { return toClientError_(error); } }
function listJobEvents(jobId) { try { return { ok: true, data: new ShopFloorService().listEvents(jobId) }; } catch (error) { return toClientError_(error); } }
function getTravelerPrintData(token) { try { return { ok: true, data: new ShopFloorService().getTravelerData(token) }; } catch (error) { return toClientError_(error); } }
function getShopDashboard() { try { return { ok: true, data: new ShopDashboardService().getLiveWip() }; } catch (error) { return toClientError_(error); } }
function getShopOperatorWorkloads() { try { return { ok: true, data: new ShopDashboardService().listOperatorWorkloads() }; } catch (error) { return toClientError_(error); } }
function listIdeas() { try { return { ok: true, data: new IdeasService().list() }; } catch (error) { return toClientError_(error); } }
function captureIdea(input) { try { return { ok: true, data: new IdeasService().capture(input) }; } catch (error) { return toClientError_(error); } }
function requestIdeaPromotion(id, confirmation, note) { try { return { ok: true, data: new IdeasService().requestPromotion(id, confirmation, note) }; } catch (error) { return toClientError_(error); } }
function recordProcessTrial(input) { try { return { ok: true, data: new ProcessTrialService().record(input) }; } catch (error) { return toClientError_(error); } }
function listProcessTrials(jobId) { try { return { ok: true, data: new ProcessTrialService().listForJob(jobId) }; } catch (error) { return toClientError_(error); } }
function recordCashReceipt(input) { try { return { ok: true, data: new CashReceiptService().recordReceipt(input) }; } catch (error) { return toClientError_(error); } }
function depositCashReceipt(id, input) { try { return { ok: true, data: new CashReceiptService().depositReceipt(id, input) }; } catch (error) { return toClientError_(error); } }
function getUndepositedPaymentSummary() { try { return { ok: true, data: new CashReceiptService().getUndepositedExceptionSummary(new Date()) }; } catch (error) { return toClientError_(error); } }
function submitPurchaseRequest(input) { try { return { ok: true, data: new PurchaseApprovalService().submit(input) }; } catch (error) { return toClientError_(error); } }
function approvePurchaseRequest(id, approver, notes) { try { return { ok: true, data: new PurchaseApprovalService().approve(id, approver, notes) }; } catch (error) { return toClientError_(error); } }
function recordPurchaseReceipt(id, reference, actor) { try { return { ok: true, data: new PurchaseApprovalService().recordReceipt(id, reference, actor) }; } catch (error) { return toClientError_(error); } }
