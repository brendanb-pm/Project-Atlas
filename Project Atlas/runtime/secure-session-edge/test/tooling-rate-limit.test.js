import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolingRateLimiter } from '../src/tooling-rate-limit.js';
import { createHttpServer, createTenantEdge, SlidingRateLimiter } from '../src/edge.js';
import { errors } from '../src/errors.js';

test('four simultaneous operators sustain normal weighted work behind one proxy', async () => {
  let now = 0;
  const gate = new ToolingRateLimiter({ clock: () => new Date(now) });
  const operators = [['A', '1'], ['A', '2'], ['B', '1'], ['A', '3']];
  for (let round = 0; round < 12; round++) {
    await Promise.all(operators.map(async ([tenantId, userId]) => {
      for (let index = 0; index < 4; index++) gate.consume({ tenantId, userId }, 1);
      if (round % 4 === 0 && userId !== '3') gate.consume({ tenantId, userId }, 3);
    }));
    now += 1600;
  }
});

test('principal and tenant excess are isolated and report the relevant window', () => {
  let now = 0;
  const gate = new ToolingRateLimiter({ clock: () => new Date(now) });
  const scope = (userId, tenantId = 'A') => ({ tenantId, userId });
  const fill = (userId) => { for (let i = 0; i < 24; i++) gate.consume(scope(userId), 1); };
  fill('1');
  assert.throws(() => gate.consume(scope('1'), 1), { throttle: { scope: 'principal-burst', limit: 24, retryAfter: 5 } });
  fill('2');
  fill('3');
  assert.throws(() => gate.consume(scope('4'), 1), { throttle: { scope: 'tenant-burst', limit: 72, retryAfter: 5 } });
  gate.consume(scope('1', 'B'), 1);
  now = 5000;
  gate.consume(scope('4'), 1);
  for (const offset of [5000, 10000, 15000]) { now = offset; for (let i = 0; i < 22; i++) gate.consume(scope('1'), 1); }
  assert.throws(() => gate.consume(scope('1'), 1), { throttle: { scope: 'principal', limit: 90, retryAfter: 45 } });
});

test('admission state remains bounded and expired capacity is reclaimed', () => {
  let now = 0;
  const gate = new ToolingRateLimiter({ clock: () => new Date(now), capacity: 4 });
  gate.consume({ tenantId: 'A', userId: '1' }, 1);
  assert.throws(() => gate.consume({ tenantId: 'B', userId: '2' }, 1), { throttle: { scope: 'capacity', limit: 4, retryAfter: 5 } });
  assert.equal(gate.events.size, 4);
  now = 60000;
  gate.consume({ tenantId: 'B', userId: '2' }, 1);
  assert.equal(gate.events.size, 4);
});

test('upload concurrency is bounded per tenant and released after completion', () => {
  const gate = new ToolingRateLimiter({ clock: () => new Date(0) });
  const upload = { binary: true };
  const first = gate.acquire({ tenantId: 'A', userId: '1' }, upload);
  const second = gate.acquire({ tenantId: 'A', userId: '2' }, upload);
  assert.throws(() => gate.acquire({ tenantId: 'A', userId: '3' }, upload), { throttle: { scope: 'tenant-upload-concurrency', limit: 2, retryAfter: 1 } });
  const other = gate.acquire({ tenantId: 'B', userId: '1' }, upload);
  first();
  gate.acquire({ tenantId: 'A', userId: '3' }, upload)();
  second();
  other();
  assert.equal(gate.uploads.size, 0);
});

test('anonymous peer budget has a bounded retry interval', () => {
  const gate = new SlidingRateLimiter({ clock: () => new Date(0), policy: { windowMs: 60000, max: 2 } });
  gate.consume('peer');
  gate.consume('peer');
  assert.throws(() => gate.consume('peer'), { throttle: { scope: 'peer', limit: 2, retryAfter: 60 } });
});

test('HTTP admission isolates authenticated sessions from anonymous abuse and forged headers', async (t) => {
  const diagnostics = [];
  const edge = createTenantEdge({
    config: { environment: 'test', origin: 'https://atlas.test', rateLimit: { windowMs: 60000, max: 2 } },
    providers: {}, onThrottle: (event) => diagnostics.push(event),
    authority: {
      async authorize({ userId, tenantId, requiredCapability }) {
        if (userId === 'reader' && requiredCapability === 'TOOLING_WRITE') throw errors.forbidden();
        return { userId, tenantId };
      }
    },
    protectedApi: {
      match(method) {
        const mutation = method === 'POST';
        return { operation: mutation ? 'TOOLING_WRITE' : 'TOOLING_READ', mutation,
          capability: mutation ? 'TOOLING_WRITE' : 'TOOLING_READ',
          execute: ({ userId, tenantId }) => ({ userId, tenantId }), body: false };
      }
    }
  });
  const sessions = {};
  for (const [userId, activeTenant] of [['a', 'A'], ['b', 'A'], ['c', 'B'], ['reader', 'A']]) {
    sessions[userId] = await edge.sessions.create({ userId, provider: 'GOOGLE',
      permittedTenants: [activeTenant], activeTenant });
  }
  const server = createHttpServer(edge);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (name, method = 'GET', cookie) => {
    const session = sessions[name];
    return fetch(`http://127.0.0.1:${server.address().port}/api/tooling/tools`, {
      method, headers: { 'x-forwarded-for': '192.0.2.1', 'x-atlas-tenant': 'forged',
        'x-atlas-user': 'forged', ...(session ? { cookie: 'atlas_session=' + session.opaque,
          origin: 'https://atlas.test', 'x-atlas-csrf': session.csrf } : cookie ? { cookie } : {}) }
    });
  };
  for (const cookie of ['', 'atlas_session=%ZZ']) assert.equal((await request('', 'GET', cookie)).status, 401);
  const anonymous = await request('');
  assert.equal(anonymous.status, 429);
  assert.ok(Number(anonymous.headers.get('Retry-After')) > 0);
  const actions = await Promise.all(['a', 'b', 'c', 'reader'].map(async (name) => {
    const response = await request(name);
    assert.equal(response.status, 200);
    return (await response.json()).data;
  }));
  assert.deepEqual(actions.map(({ tenantId }) => tenantId), ['A', 'A', 'B', 'A']);
  assert.equal((await request('reader', 'POST')).status, 403);
  assert.deepEqual(Object.keys(diagnostics[0]).sort(), ['category', 'limit', 'operation', 'reason', 'retryAfter', 'scope', 'status']);
});
