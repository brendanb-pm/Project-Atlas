# MOS-125 Google OIDC setup runbook

Do not create credentials during source development. In the approved Google Cloud project, configure the OAuth consent screen for the deployment policy, then create a Web application OAuth client for the external authentication/session edge.

1. Register the exact HTTPS edge callback URI; do not use wildcard callbacks or browser-selected returns.
2. Use authorization code + PKCE and initial scopes `openid`, `profile`, `email`. Email and hosted-domain claims are attributes/policy inputs, never the canonical identity key; Atlas uses exact issuer + `sub`.
3. Store any client secret only in the edge's approved secret manager. Never store it in Apps Script Properties, Sheets, source, or browser code.
4. Configure Workspace internal/external and test-user policy deliberately. Domain restrictions, if approved, supplement rather than replace explicit Atlas membership.
5. Map public values to `ATLAS_AUTH_CONFIG.google`: `enabled`, public `clientId`, authorization endpoint, exact issuers, optional approved `allowedDomains`, and scopes. Configure the external verification gateway and exact redirect URI at the root.
6. Verify consent, state, nonce, PKCE, signature/JWKS, issuer, audience, expiry, replay, unknown subject, inactive membership, entitlement denial, session expiration/revocation and Atlas-only logout.

Enabling a Google OAuth client does not grant Atlas membership or capabilities and does not replace separate Google Calendar authorization.
