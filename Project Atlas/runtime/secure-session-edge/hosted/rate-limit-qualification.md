# MOS-140C concurrent operator qualification

## Cause

The isolated Caddy configuration has only a reverse proxy. The running Caddy image reported no rate-limit module. Baseline 429 responses contained the Atlas error envelope and correlation ID. The Atlas protected route charged a 30-per-minute socket-peer bucket before session resolution; the socket peer was Caddy for every operator. Storage and AI are reached only after edge admission and did not generate these search, detail, or history responses. The AI processing service retains its separate rate and concurrency controls.

## Policy and operations

| Scope | Limit |
|---|---:|
| Authenticated operator within tenant | 24 units / 5 seconds and 105 units / minute |
| Tenant aggregate | 72 units / 5 seconds and 315 units / minute |
| Anonymous tooling requests per socket peer | 30 / minute |
| Cookie-bearing session lookups per socket peer | 600 / minute, with at most 64 lookups in flight per Atlas instance |
| Evidence uploads in flight | 2 per tenant, 4 per Atlas instance |

Read requests cost one unit, ordinary mutations three, and binary uploads and AI requests six. The five-second bounds absorb a screen load and inhibit rapid retries. Four reads every 3.2 seconds cost about 75 units per minute. Three weighted mutations add up to nine units per minute in the rehearsal. The initial 90-unit prototype also had to account for immediate tool setup and evidence readback and rejected five ordinary requests from the setup operator. The 105-unit window gives that setup operator room while keeping the tenant cap at three full operator budgets.

Keys come from the resolved server session. Header-provided identities play no part in admission. Atlas still checks Origin, CSRF, capability, and tenant authority before business execution. Counters are process-local. Each map caps at 4,096 buckets and reclaims expired entries before failing closed at capacity. A 429 returns integer `Retry-After` for the longest applicable exceeded tooling window. No request is replayed. Edge throttle diagnostics contain status, coarse tooling read/write category, policy scope, limit, reason and retry interval. They exclude cookies, tokens, paths, tenant IDs, user IDs and request data.

The 600-lookup safety ceiling and the in-flight ceiling remain shared by clients behind one proxy. Severe invalid-cookie traffic can still affect legitimate operator requests. A multi-instance installation would require shared enforcement and a separately reviewed trusted ingress configuration.

## Rehearsal

The Docker rehearsal used Caddy and PostgreSQL 17.11 behind internal networking, four independent synthetic sessions and an anonymous client. It ran 22 rounds about 3.2 seconds apart with five simultaneous clients, covering search, detail, history, evidence metadata and locator mutations. The baseline rejected 320 ordinary authenticated requests and 18 ordinary anonymous requests as shared-peer 429s. An additional 64 deliberately excessive requests were all rejected after the shared bucket had saturated. Per-operator and per-route percentile observations are from a local shared Docker Desktop host and are indicative only. The load test exercised evidence metadata; the separate Chromium fixture exercised upload with simulated storage.

| Client | Requests | Baseline ordinary 429 | Final 200 | Final 403 | Final ordinary 429 | Other final HTTP | Final search p50/p95/p99 ms |
|---|---:|---:|---:|---:|---:|---|---|
| Tenant A editor | 94 | 78 | 94 | 0 | 0 | — | 12.6 / 16.7 / 73.2 |
| Tenant A second operator | 94 | 80 | 94 | 0 | 0 | — | 13.7 / 18.2 / 50.5 |
| Tenant B operator | 95 | 82 | 94 | 0 | 0 | 1 expected 404 | 12.8 / 17.4 / 54.5 |
| Tenant A reader | 94 | 80 | 91 | 3 | 0 | — | 13.2 / 21.9 / 51.4 |
| Anonymous | 22 | 18 | 0 | 0 | 0 | 22 expected 401 | 6.5 / 8.8 / 38.3 |

Neither ordinary run recorded 500, 502, or 503. Deliberate excess generated 20 anonymous peer 429s and 12 principal burst 429s, all with `Retry-After`. Tenant aggregate overflow and post-window recovery passed deterministic tests. During final load, sampled PostgreSQL, Atlas and Caddy working sets were 66.33, 48.05 and 14.72 MiB, with CPU at 5.13%, 6.51% and 1.78%, respectively.

In a separate run with the PostgreSQL recovery code applied locally, Caddy readiness returned in 2.980 seconds from the stop command, including a deliberate two-second outage. Atlas returned temporary 503s and resumed serving through Caddy. A stale regrind replay returned 409 and readback confirmed one persisted measurement. The two existing draft PRs are separate from this branch. The Chromium overlay manually reconciled the two scoped edits to edge routing for local verification.

The measured working sets support continuing with a 4 GiB x64 host candidate. Docker Desktop guest resources and synthetic fixture traffic do not qualify host capacity, live Azure, Entra, S3, AI, or hosted HTTPS. Keep deployment NO-GO pending host and live acceptance approval.
