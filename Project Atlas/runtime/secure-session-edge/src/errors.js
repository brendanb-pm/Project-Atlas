export class EdgeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'EdgeError';
    this.code = code;
    this.status = status;
  }
}

export const errors = {
  unauthenticated: () => new EdgeError('UNAUTHENTICATED', 'Sign in is required.', 401),
  expired: () => new EdgeError('SESSION_EXPIRED', 'Your session has expired. Sign in again.', 401),
  revoked: () => new EdgeError('SESSION_REVOKED', 'Your session is no longer available. Sign in again.', 401),
  forbidden: () => new EdgeError('FORBIDDEN', 'Access is unavailable.', 403),
  accessUnavailable: () => new EdgeError('ACCESS_UNAVAILABLE', 'Access is unavailable.', 403),
  csrf: () => new EdgeError('INVALID_CSRF', 'This action could not be completed. Try again.', 403),
  invalidCallback: () => new EdgeError('INVALID_CALLBACK', 'Sign-in could not be completed. Try again.', 400),
  providerUnavailable: () => new EdgeError('PROVIDER_UNAVAILABLE', 'This sign-in provider is temporarily unavailable.', 503),
  sessionStoreUnavailable: () => new EdgeError('SESSION_STORE_UNAVAILABLE', 'Sign-in is temporarily unavailable. Try again.', 503),
  entitlementUnavailable: () => new EdgeError('ENTITLEMENT_UNAVAILABLE', 'Access is temporarily unavailable. Try again.', 503),
  invalidInput: () => new EdgeError('INVALID_REQUEST', 'The request could not be completed.', 400),
  notFound: () => new EdgeError('NOT_FOUND', 'This route is unavailable.', 404)
};

export function safeError(error) {
  if (error instanceof EdgeError) return error;
  return new EdgeError('TEMPORARY_FAILURE', 'The request could not be completed. Try again.', 503);
}
