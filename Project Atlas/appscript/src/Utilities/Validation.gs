function requireValue_(value, label) { if (value === undefined || value === null || String(value).trim() === '') throw new VmosValidationError(label + ' is required.'); }
function optionalNumber_(value, label) { if (value !== undefined && value !== null && value !== '' && isNaN(Number(value))) throw new VmosValidationError(label + ' must be a number.'); }
function optionalDate_(value, label) { if (value && isNaN(new Date(value).getTime())) throw new VmosValidationError(label + ' must be a valid date.'); }
function validateEntityInput_(definition, data) {
  definition.required.forEach(function (field) { requireValue_(data[field], field); });
  if (data.amount !== undefined) optionalNumber_(data.amount, 'amount');
  ['receivedDate', 'dueDate', 'issueDate'].forEach(function (field) { optionalDate_(data[field], field); });
}
