/**
 * Proposed dedicated store for MOS-113. This configuration does not create a
 * worksheet and is intentionally separate from the deployed production maps.
 */
var VMOS_DEFAULT_CASH_RECEIPT_MAPPING = {
  sheetName: 'CashReceipts',
  idField: 'ReceiptID',
  idPrefix: 'RCPT',
  headers: ['ReceiptID', 'Receipt Command ID', 'InvoiceID', 'CustomerID', 'Received Date', 'Amount', 'Payment Method', 'Reference Number', 'Deposit Status', 'Deposit Date', 'Deposit Reference', 'Deposit Command ID', 'Notes', 'Created At', 'Created By', 'Updated At', 'Updated By', 'Security Operation ID', 'Security Operation Fingerprint', 'Security Tenant ID', 'Security Actor ID'],
  fields: {
    id: ['ReceiptID'], receiptCommandId: ['Receipt Command ID'], invoiceId: ['InvoiceID'], customerId: ['CustomerID'], receivedDate: ['Received Date'], amount: ['Amount'], paymentMethod: ['Payment Method'], referenceNumber: ['Reference Number'], depositStatus: ['Deposit Status'], depositDate: ['Deposit Date'], depositReference: ['Deposit Reference'], depositCommandId: ['Deposit Command ID'], notes: ['Notes'], createdAt: ['Created At'], createdBy: ['Created By'], updatedAt: ['Updated At'], updatedBy: ['Updated By'], securityOperationId: ['Security Operation ID'], securityOperationFingerprint: ['Security Operation Fingerprint'], securityTenantId: ['Security Tenant ID'], securityActorId: ['Security Actor ID']
  }
};

function getCashReceiptConfig_() {
  var baseConfig = getVmosConfig_();
  var rawMapping = PropertiesService.getScriptProperties().getProperty('VMOS_CASH_RECEIPT_MAPPING');
  var mapping = rawMapping ? JSON.parse(rawMapping) : VMOS_DEFAULT_CASH_RECEIPT_MAPPING;
  if (!mapping.sheetName || !mapping.idField || !mapping.fields || !mapping.fields.id) throw new VmosConfigurationError_('VMOS_CASH_RECEIPT_MAPPING is incomplete.');
  mapping.fields.securityOperationId = mapping.fields.securityOperationId || ['Security Operation ID'];
  mapping.fields.securityOperationFingerprint = mapping.fields.securityOperationFingerprint || ['Security Operation Fingerprint'];
  mapping.fields.securityTenantId = mapping.fields.securityTenantId || ['Security Tenant ID'];
  mapping.fields.securityActorId = mapping.fields.securityActorId || ['Security Actor ID'];
  return { spreadsheetId: baseConfig.spreadsheetId, mapping: mapping };
}
