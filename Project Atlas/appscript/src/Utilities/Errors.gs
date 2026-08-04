function VmosError(message, code) { this.name = 'VmosError'; this.message = message; this.code = code || 'VMOS_ERROR'; }
VmosError.prototype = Object.create(Error.prototype);
function VmosValidationError(message) { VmosError.call(this, message, 'VALIDATION_ERROR'); this.name = 'VmosValidationError'; }
VmosValidationError.prototype = Object.create(VmosError.prototype);
function VmosConfigurationError(message) { VmosError.call(this, message, 'CONFIGURATION_ERROR'); this.name = 'VmosConfigurationError'; }
VmosConfigurationError.prototype = Object.create(VmosError.prototype);
function VmosNotFoundError(message) { VmosError.call(this, message, 'NOT_FOUND'); this.name = 'VmosNotFoundError'; }
VmosNotFoundError.prototype = Object.create(VmosError.prototype);

function toClientError_(error) {
  return { ok: false, error: { code: error.code || 'UNEXPECTED_ERROR', message: error.message || 'An unexpected error occurred.' } };
}
