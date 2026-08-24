import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomOpaque(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
export function hash(value) { return createHash('sha256').update(String(value)).digest('base64url'); }
export function equalsHash(value, expectedHash) {
  const actual = Buffer.from(hash(value));
  const expected = Buffer.from(String(expectedHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function correlationId() { return `edge-${randomOpaque(18)}`; }
export function validOpaque(value, min = 24, max = 256) {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}
export function safeRoute(route, allowedRoutes) {
  const candidate = String(route || 'home').trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(candidate) && allowedRoutes.includes(candidate) ? candidate : 'home';
}
export function parseCookies(header = '') {
  return String(header).split(';').reduce((result, entry) => {
    const index = entry.indexOf('=');
    if (index > 0) result[entry.slice(0, index).trim()] = decodeURIComponent(entry.slice(index + 1).trim());
    return result;
  }, {});
}
export function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value || '')}`, `Path=${options.path || '/'}`];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}
export function securityHeaders({ production = false } = {}) {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store'
  };
  if (production) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}
