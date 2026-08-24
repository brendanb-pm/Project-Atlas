/**
 * Installation-controlled persistence selection. This configuration is read
 * only on the server and is never accepted from browser input. MOS-133B ships
 * only the Sheets implementation; POSTGRESQL deliberately fails closed until
 * MOS-133C registers a provider.
 */
var ATLAS_PERSISTENCE_PROVIDER_TYPES_ = { SHEETS: 'SHEETS', POSTGRESQL: 'POSTGRESQL' };
function getAtlasPersistenceConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var provider = String(properties.getProperty('ATLAS_PERSISTENCE_PROVIDER') || ATLAS_PERSISTENCE_PROVIDER_TYPES_.SHEETS).trim().toUpperCase();
  if (Object.keys(ATLAS_PERSISTENCE_PROVIDER_TYPES_).indexOf(provider) === -1) throw new VmosConfigurationError_('Atlas persistence provider configuration is invalid.');
  return Object.freeze({ provider: provider, routineReadMaximum: 200 });
}
