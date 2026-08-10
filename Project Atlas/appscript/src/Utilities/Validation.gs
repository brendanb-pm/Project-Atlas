function requireValue_(value, label) { if (value === undefined || value === null || String(value).trim() === '') throw new VmosValidationError_(label + ' is required.'); }
function optionalNumber_(value, label) { if (value !== undefined && value !== null && value !== '' && isNaN(Number(value))) throw new VmosValidationError_(label + ' must be a number.'); }
function optionalDate_(value, label) { if (value && isNaN(new Date(value).getTime())) throw new VmosValidationError_(label + ' must be a valid date.'); }
function validateEntityInput_(definition, data, requireRequiredFields) {
  if (requireRequiredFields !== false) definition.required.forEach(function (field) { requireValue_(data[field], field); });
  ['amount', 'subtotal', 'nre', 'tooling', 'material', 'outsideServices', 'shipping', 'tax', 'total', 'quantity', 'toolingRecovery', 'materialCost', 'estimatedHours', 'actualHours', 'grossMargin', 'confidenceScore', 'amountPaid', 'balanceDue'].forEach(function (field) { if (data[field] !== undefined) optionalNumber_(data[field], field); });
  ['receivedDate', 'dueDate', 'issueDate', 'quoteDate', 'expirationDate', 'invoiceDate', 'paymentDate'].forEach(function (field) { if (data[field] !== undefined) optionalDate_(data[field], field); });
}
