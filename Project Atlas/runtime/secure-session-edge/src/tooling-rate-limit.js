import { EdgeError } from './errors.js';

const minute = 60_000;
const burst = 5_000;
const rules = Object.freeze([
  { scope: 'principal-burst', window: burst, limit: 24 },
  { scope: 'principal', window: minute, limit: 90 },
  { scope: 'tenant-burst', window: burst, limit: 72 },
  { scope: 'tenant', window: minute, limit: 270 }
]);

export function rateLimitError(scope, limit, waitMs) {
  return Object.assign(new EdgeError('RATE_LIMITED', 'Try again shortly.', 429), {
    throttle: { scope, limit, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) }
  });
}

export class ToolingRateLimiter {
  constructor({ clock, capacity = 4096 } = {}) {
    this.clock = clock;
    this.capacity = capacity;
    this.events = new Map();
    this.uploads = new Map();
    this.activeUploads = 0;
  }

  acquire(scope, descriptor) {
    const uploads = this.uploads.get(scope.tenantId) || 0;
    if (descriptor.binary && (this.activeUploads >= 4 || uploads >= 2)) {
      throw rateLimitError(uploads >= 2 ? 'tenant-upload-concurrency' : 'upload-concurrency', uploads >= 2 ? 2 : 4, 1000);
    }
    const expensive = descriptor.binary || descriptor.operation.startsWith('TOOLING_AI_');
    this.consume(scope, expensive ? 6 : descriptor.mutation ? 3 : 1);
    if (!descriptor.binary) return () => {};
    this.uploads.set(scope.tenantId, uploads + 1);
    this.activeUploads++;
    return () => {
      const remaining = this.uploads.get(scope.tenantId) - 1;
      if (remaining === 0) this.uploads.delete(scope.tenantId);
      else this.uploads.set(scope.tenantId, remaining);
      this.activeUploads--;
    };
  }

  consume({ tenantId, userId }, cost) {
    const now = this.clock().getTime();
    let rejection;
    const windows = rules.map(({ scope, window, limit }) => {
      const key = JSON.stringify(scope.startsWith('principal') ? [scope, tenantId, userId] : [scope, tenantId]);
      const active = (this.events.get(key)?.events || []).filter((entry) => entry.at > now - window);
      let excess = active.reduce((total, entry) => total + entry.cost, cost) - limit;
      for (const entry of active) {
        if (excess <= 0) break;
        excess -= entry.cost;
        if (excess <= 0) {
          const wait = entry.at + window - now;
          if (!rejection || wait > rejection.wait) rejection = { scope, limit, wait };
        }
      }
      return { key, active, expires: now + window };
    });
    if (rejection) throw rateLimitError(rejection.scope, rejection.limit, rejection.wait);
    const pending = windows.filter(({ key }) => !this.events.has(key)).length;
    if (this.events.size + pending > this.capacity) {
      let earliest = Infinity;
      for (const [key, entry] of this.events) {
        if (entry.expires <= now) this.events.delete(key);
        else earliest = Math.min(earliest, entry.expires);
      }
      if (this.events.size + windows.filter(({ key }) => !this.events.has(key)).length > this.capacity) {
        throw rateLimitError('capacity', this.capacity, earliest - now);
      }
    }
    for (const { key, active, expires } of windows) {
      this.events.set(key, { events: [...active, { at: now, cost }], expires });
    }
  }
}
