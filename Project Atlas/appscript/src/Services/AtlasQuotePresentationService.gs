/** Beta presentation model; it is pure and never creates, sends, or stores a quote. */
function buildAtlasQuotePresentation_(profile, quote) {
  profile = resolveAtlasDeploymentProfile_(cloneAtlasValue_(profile)); quote = quote || {};
  return { seller: { organizationName: profile.identity.organizationName, deploymentName: profile.identity.deploymentName, logoReference: profile.branding.logoReference || '' }, branding: profile.branding, quote: { id: quote.id || '', revision: quote.revision || 0, customerName: quote.customerName || '', description: quote.description || '', lines: quote.lines || [], paymentTerms: quote.paymentTerms || '', validity: quote.validity || '', deliveryCommitment: quote.deliveryCommitment || '', assumptions: quote.assumptions || '', exclusions: quote.exclusions || '', total: quote.total || 0 }, terminology: profile.terminology };
}
