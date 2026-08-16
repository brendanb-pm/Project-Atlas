# MOS-125 Microsoft Entra setup runbook

Do not perform these steps in source development. In Microsoft Entra admin center, create an App Registration owned by the deployment administrator. For initial VMOS validation choose the approved organizational-directory account type; use a separate controlled registration/validation before enabling multitenant organizations. Personal Microsoft accounts remain disabled unless policy explicitly approves them.

1. Register the exact external authentication-edge redirect URI; do not use wildcard or arbitrary return URLs.
2. Record the public Application (client) ID and exact issuer/tenant policy. Configure only `openid`, `profile`, and `email` initially; email is not the identity key.
3. Use authorization code + PKCE. Store any confidential credential or certificate only in the edge's approved secret manager, with rotation ownership and expiry monitoring. Never put it in Apps Script, Sheets, source, or browser code.
4. Configure logout/redirect behavior separately. Atlas logout revokes the Atlas session; Microsoft global logout is optional and must be accurately labeled.
5. Add a non-production test user and obtain required administrator/user consent under organizational policy.
6. Map public values to `ATLAS_AUTH_CONFIG.microsoft`: `enabled`, `clientId`, `authorizationEndpoint`, exact `issuers`, `allowPersonalAccounts`, and scopes. Map edge URL and exact callback at the root configuration.
7. Verify state, nonce, PKCE, issuer, audience, expiry, stable `sub`/object identity, replay rejection, wrong tenant, unknown identity, inactive membership, entitlement denial, logout and revocation. Confirm no account is created or linked from email.

Activation requires the external edge and every protected request to present a verified Atlas session; App Registration alone does not approve production access.
