function doGet(e) {
  if (e && e.parameter && e.parameter.shop === '1') return HtmlService.createTemplateFromFile('UI/ShopFloor').evaluate().setTitle('VMOS Shop Floor').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return HtmlService.createTemplateFromFile('UI/Index').evaluate().setTitle('VMOS MVP').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
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
