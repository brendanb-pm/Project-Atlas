/**
 * Reads both legacy "rfq 26-0127" and canonical "RFQ-26-0127" IDs, but
 * always emits the canonical uppercase PREFIX-YY-#### form.
 */
function parseVmosSequence_(id, prefix, year) {
  var escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var expression = new RegExp('^\\s*' + escapedPrefix + '(?:\\s+|\\s*-\\s*)' + year + '\\s*-\\s*([0-9]{4})\\s*$', 'i');
  var match = expression.exec(String(id || ''));
  return match ? parseInt(match[1], 10) : null;
}

/** Generates canonical prefix-YY-#### IDs under a document lock. */
function generateVmosId_(prefix, repository) {
  // Standalone web apps do not have a document lock, so use the script lock.
  var lock = (LockService.getDocumentLock && LockService.getDocumentLock()) || LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
    var expectedPrefix = prefix.toUpperCase() + '-' + year + '-';
    var highest = repository.list().reduce(function (max, row) {
      var number = parseVmosSequence_(row.id, prefix, year);
      return number === null ? max : Math.max(max, number);
    }, 0);
    if (highest >= 9999) throw new VmosValidationError('ID sequence for ' + prefix + '-' + year + ' has reached its 4-digit limit.');
    return expectedPrefix + ('0000' + (highest + 1)).slice(-4);
  } finally { lock.releaseLock(); }
}
