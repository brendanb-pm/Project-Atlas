/** Read-only presentation configuration. No property is created or modified here. */
function getAtlasDeploymentProfile_() {
  var raw=PropertiesService.getScriptProperties().getProperty('ATLAS_DEPLOYMENT_PROFILE'),configured={};
  if(raw){try{configured=JSON.parse(raw);}catch(error){throw new VmosConfigurationError_('Atlas deployment presentation profile is invalid.');}}
  var modules=Array.isArray(configured.enabledModules)?configured.enabledModules:[];
  return Object.freeze({
    productDisplayName:atlasDisplayValue_(configured.productDisplayName,'Atlas'),
    organizationName:atlasDisplayValue_(configured.organizationName,''),
    deploymentDisplayName:atlasDisplayValue_(configured.deploymentDisplayName,''),
    enabledModules:Object.freeze(modules.map(function(value){return String(value||'').trim().toUpperCase();}).filter(Boolean)),
    terminology:Object.freeze({customer:'Customer',job:'Job',workOrder:'Work Order',followUp:'Follow-Up'})
  });
}
function atlasDisplayValue_(value,fallback){var text=String(value||'').trim();return text?text.slice(0,100):fallback;}
