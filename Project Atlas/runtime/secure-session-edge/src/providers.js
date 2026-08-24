import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { errors } from './errors.js';
import { randomOpaque } from './security.js';

const PROVIDERS = new Set(['GOOGLE', 'MICROSOFT']);

export function validateProviderConfig(config) {
  if (!config || !PROVIDERS.has(config.id) || !config.enabled || !config.clientId || !config.authorizationEndpoint || !config.tokenEndpoint || !config.jwksUri || !Array.isArray(config.issuers) || !config.issuers.length) throw errors.providerUnavailable();
  for (const url of [config.authorizationEndpoint, config.tokenEndpoint, config.jwksUri]) if (!String(url).startsWith('https://')) throw errors.providerUnavailable();
  return config;
}

export class OidcProvider {
  constructor(config, { fetchImpl = fetch } = {}) { this.config = validateProviderConfig(config); this.fetch = fetchImpl; this.jwks = createRemoteJWKSet(new URL(config.jwksUri)); }
  authorizationUrl(attempt) {
    const query = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', redirect_uri: this.config.redirectUri, scope: (this.config.scopes || ['openid', 'profile', 'email']).join(' '), state: attempt.state, nonce: attempt.nonce, code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'), code_challenge_method: 'S256' });
    return `${this.config.authorizationEndpoint}?${query}`;
  }
  async complete({ code, attempt }) {
    if (!code || String(code).length > 4096) throw errors.invalidCallback();
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: this.config.redirectUri, client_id: this.config.clientId, code_verifier: attempt.verifier });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    let response;
    try { response = await this.fetch(this.config.tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, redirect: 'error' }); } catch { throw errors.providerUnavailable(); }
    if (!response.ok) throw errors.invalidCallback();
    const tokenSet = await response.json(); if (!tokenSet || typeof tokenSet.id_token !== 'string') throw errors.invalidCallback();
    let verified;
    try { verified = await jwtVerify(tokenSet.id_token, this.jwks, { issuer: this.config.issuers, audience: this.config.clientId, clockTolerance: 60 }); } catch { throw errors.invalidCallback(); }
    const claims = verified.payload;
    if (claims.nonce !== attempt.nonce || !claims.sub || (this.config.id === 'MICROSOFT' && !this.config.allowPersonalAccounts && claims.tid === 'consumers')) throw errors.invalidCallback();
    return { provider: this.config.id, issuer: String(claims.iss), subject: String(claims.sub), authenticatedAt: new Date(Number(claims.auth_time || Math.floor(Date.now() / 1000)) * 1000).toISOString(), authenticationContext: 'OIDC' };
  }
}

// Node crypto is used only for the PKCE digest; JWT/JWKS verification remains in
// the maintained jose library rather than custom token cryptography.

/** Deterministic fixture adapter. The factory rejects it for production mode. */
export class TestOidcProvider {
  constructor(config, { claimsByCode = {} } = {}) { this.config = validateProviderConfig(config); this.claimsByCode = claimsByCode; this.calls = []; this.isTestAdapter = true; }
  authorizationUrl(attempt) { return `https://test-provider.invalid/${this.config.id.toLowerCase()}?state=${encodeURIComponent(attempt.state)}&nonce=${encodeURIComponent(attempt.nonce)}&code_challenge=${randomOpaque(24)}`; }
  async complete({ code, attempt }) {
    this.calls.push({ code, attemptId: attempt.id }); const claims = this.claimsByCode[code];
    if (!claims || claims.signatureVerified !== true || claims.nonce !== attempt.nonce || !this.config.issuers.includes(claims.iss) || claims.aud !== this.config.clientId || !claims.sub || Number(claims.exp) <= Math.floor(Date.now() / 1000)) throw errors.invalidCallback();
    if (this.config.id === 'MICROSOFT' && !this.config.allowPersonalAccounts && claims.accountType === 'PERSONAL') throw errors.invalidCallback();
    return { provider: this.config.id, issuer: claims.iss, subject: claims.sub, authenticatedAt: new Date(Number(claims.auth_time || Math.floor(Date.now() / 1000)) * 1000).toISOString(), authenticationContext: 'TEST_OIDC' };
  }
}
