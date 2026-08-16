/**
 * Dedicated, opt-in persistence contract for purchase approvals (MOS-114).
 *
 * This is intentionally separate from the production workbook mapping and the
 * shop-floor operational mapping. It never creates a sheet or changes headers.
 * Before use, set both Script Properties below:
 *   VMOS_PURCHASE_APPROVAL_MAPPING  JSON mapping with a sheetName and fields
 *   VMOS_PURCHASE_APPROVAL_THRESHOLD positive or zero numeric spend threshold
 *
 * Required logical fields and proposed headers:
 * Purchase Request ID, Request Date, Requester, Vendor ID, Vendor, Category,
 * Classification, Business Justification, Expected ROI / Need, Description,
 * Amount, Actual Purchase Amount, Status, Approval Required, Approver,
 * Approved At, Receipt Reference, Notes, Created At, Updated At, Created By,
 * Updated By, Security Operation ID, Security Operation Fingerprint,
 * Security Tenant ID, Security Actor ID.
 */
var VMOS_PURCHASE_APPROVAL_FIELDS = ['id', 'requestDate', 'requester', 'vendorId', 'vendor', 'category', 'classification', 'businessJustification', 'expectedRoiNeed', 'description', 'amount', 'actualPurchaseAmount', 'status', 'approvalRequired', 'approver', 'approvedAt', 'receiptReference', 'notes', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'securityOperationId', 'securityOperationFingerprint', 'securityTenantId', 'securityActorId'];

function getPurchaseApprovalConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var rawMapping = properties.getProperty('VMOS_PURCHASE_APPROVAL_MAPPING');
  if (!rawMapping) throw new VmosConfigurationError_('VMOS_PURCHASE_APPROVAL_MAPPING is not configured. Purchase approvals are disabled; no sheet was changed.');
  var mapping;
  try { mapping = JSON.parse(rawMapping); } catch (error) { throw new VmosConfigurationError_('VMOS_PURCHASE_APPROVAL_MAPPING must be valid JSON.'); }
  if (!mapping || !mapping.sheetName || !mapping.fields || !mapping.idField) throw new VmosConfigurationError_('Purchase approval mapping requires sheetName, idField, and fields.');
  VMOS_PURCHASE_APPROVAL_FIELDS.forEach(function (field) {
    if (!Array.isArray(mapping.fields[field]) || !mapping.fields[field].length) throw new VmosConfigurationError_('Purchase approval mapping is missing field "' + field + '".');
  });
  var rawThreshold = properties.getProperty('VMOS_PURCHASE_APPROVAL_THRESHOLD');
  if (rawThreshold === null || rawThreshold === '' || isNaN(Number(rawThreshold)) || Number(rawThreshold) < 0) {
    throw new VmosConfigurationError_('VMOS_PURCHASE_APPROVAL_THRESHOLD must be a non-negative number.');
  }
  var base = getVmosConfig_();
  return { spreadsheetId: base.spreadsheetId, mapping: mapping, threshold: Number(rawThreshold) };
}
