/** Generates prefix-YY-#### IDs under a document lock to avoid duplicate IDs. */
function generateVmosId_(prefix, repository) {
  // Standalone web apps do not have a document lock, so use the script lock.
  var lock = (LockService.getDocumentLock && LockService.getDocumentLock()) || LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
    var expectedPrefix = prefix + '-' + year + '-';
    var highest = repository.list().reduce(function (max, row) {
      var id = String(row.id || '');
      if (id.indexOf(expectedPrefix) !== 0) return max;
      var number = parseInt(id.substring(expectedPrefix.length), 10);
      return isNaN(number) ? max : Math.max(max, number);
    }, 0);
    return expectedPrefix + ('0000' + (highest + 1)).slice(-4);
  } finally { lock.releaseLock(); }
}
