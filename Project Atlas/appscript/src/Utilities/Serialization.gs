/** Converts repository output into values safe to return through google.script.run. */
function serializeVmosValue_(value) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Object.prototype.toString.call(value) === '[object Date]') return value.toISOString();
  if (Array.isArray(value)) return value.map(function (item) { return serializeVmosValue_(item); });
  if (typeof value === 'object') {
    var serialized = {};
    Object.keys(value).forEach(function (key) { serialized[key] = serializeVmosValue_(value[key]); });
    return serialized;
  }
  return String(value);
}
