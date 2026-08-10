function VmosError_(message, code) { this.name = 'VmosError_'; this.message = message; this.code = code || 'VMOS_ERROR'; }
VmosError_.prototype = Object.create(Error.prototype);
function VmosValidationError_(message) { VmosError_.call(this, message, 'VALIDATION_ERROR'); this.name = 'VmosValidationError_'; }
VmosValidationError_.prototype = Object.create(VmosError_.prototype);
function VmosConfigurationError_(message) { VmosError_.call(this, message, 'CONFIGURATION_ERROR'); this.name = 'VmosConfigurationError_'; }
VmosConfigurationError_.prototype = Object.create(VmosError_.prototype);
function VmosNotFoundError_(message) { VmosError_.call(this, message, 'NOT_FOUND'); this.name = 'VmosNotFoundError_'; }
VmosNotFoundError_.prototype = Object.create(VmosError_.prototype);
function VmosThrottleError_(message, retryAfterSeconds) { VmosError_.call(this, message, 'THROTTLED'); this.name = 'VmosThrottleError_'; this.retryAfterSeconds = retryAfterSeconds || 1; }
VmosThrottleError_.prototype = Object.create(VmosError_.prototype);

function clientErrorReference_() {
  try { return 'ERR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(); }
  catch (ignored) { return 'ERR-' + String(new Date().getTime()); }
}
function redactDiagnosticText_(value) {
  return String(value || '')
    .replace(/(Bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:access|refresh|oauth|api|provider)[ _-]?token(?:\s*[:=]\s*|\s+))[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:password|secret|api[ _-]?key)(?:\s*[:=]\s*|\s+))[^\s,;]+/gi, '$1[REDACTED]');
}
function logClientError_(error, referenceId) {
  var diagnostic = {
    referenceId: referenceId,
    code: error && error.code || 'UNEXPECTED_ERROR',
    name: error && error.name || 'Error',
    message: redactDiagnosticText_(error && error.message || String(error)),
    stack: redactDiagnosticText_(error && error.stack || '')
  };
  try { console.error(JSON.stringify(diagnostic)); } catch (ignored) {}
}
function safeClientError_(error, referenceId) {
  var code = error && error.code || 'UNEXPECTED_ERROR', messages = {
    VALIDATION_ERROR: error && error.message || 'Check the entered information and try again.',
    AUTHORIZATION_ERROR: 'You do not have permission to complete this request.',
    NOT_FOUND: 'The requested record was not found.',
    CONFLICT: 'This record changed elsewhere. Refresh and review it before trying again.',
    CONFIGURATION_ERROR: 'This feature is not configured.',
    CONFIGURATION_UNAVAILABLE: 'This feature is not configured.',
    PROVIDER_UNAVAILABLE: 'The connected service is temporarily unavailable.',
    THROTTLED: error && error.message || 'Too many requests. Wait briefly, then try again.',
    UNKNOWN_OUTCOME: 'The result could not be confirmed. Refresh the record before trying again.',
    OPERATION_IN_PROGRESS: 'This request is already being processed. Refresh shortly to confirm the result.'
  };
  var publicCode = code === 'CONFIGURATION_ERROR' ? 'CONFIGURATION_UNAVAILABLE' : (messages[code] ? code : 'INTERNAL_ERROR');
  var response = { code: publicCode, message: messages[code] || 'Your request could not be completed.', referenceId: referenceId };
  if (code === 'THROTTLED') response.retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds || 1));
  return response;
}
function toClientError_(error) {
  var referenceId = clientErrorReference_();
  logClientError_(error, referenceId);
  return { ok: false, error: safeClientError_(error, referenceId) };
}
