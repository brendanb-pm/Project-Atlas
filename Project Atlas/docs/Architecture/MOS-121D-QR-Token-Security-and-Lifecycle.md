# MOS-121D — QR Token Security and Lifecycle

Release channel: **MAIN**
Baseline: `66ea1e056c8f584feb1445369475a4a92e1fcfcf`

## Security boundary

A shop-floor QR token is an opaque locator for one Job and its assigned workflow. It is not an Atlas identity, session, role, permission, or audit actor. The intended authorization composition is:

`Authenticated operator + active tenant membership + required capability + valid scoped QR token + valid workflow state -> permitted command`

MOS-121D enforces the token and workflow-state portions. The authenticated-principal, membership, capability, and immutable `AuditContext` gate remains dependent on the MOS-121B/C authorized-execution boundary. Until that gate is implemented, the current `USER_DEPLOYING` / `ANYONE` deployment profile is not approved for production mutation.

## Implementation findings and disposition

| Severity | Finding | Disposition |
|---|---|---|
| HIGH | QR-driven mutation endpoints previously accepted only a client JobID, so possession of a token was not proven or scoped during the mutation. | Fixed: transition, problem, and block-resolution commands require an active token bound to the same Job. |
| HIGH | The current deployment lacks the general authenticated-principal and capability gate. QR possession can therefore reach the token/workflow checks without proving operator identity. | Open dependency on MOS-121 identity enforcement; QR-specific code does not pretend the token supplies identity. |
| MEDIUM | No repository/service operation supported durable revocation or rotation. | Fixed behind server-side service methods; no unguarded operator endpoint was added. |
| MEDIUM | Malformed, unknown, and revoked values produced distinguishable errors. | Fixed with one operator-safe unavailable response. |
| MEDIUM | Traveler data and UI displayed the raw token as text. | Fixed; the token remains encoded only in the QR destination and is not returned as a display field. |
| MEDIUM | Problem and block-resolution commands accepted a client-provided responsible party. | Fixed: that assignment-like attribution now uses the available server audit source. It becomes authoritative only after MOS-121 identity enforcement. |
| LOW | Query-string tokens may appear in browser history or infrastructure logs; the configured QR image renderer receives the encoded scan URL. | Reduced with `no-referrer` on QR surfaces. Production must use an approved renderer/logging policy and treat locator URLs as internal operational data. |

## Token generation and scope

Tokens use Apps Script `Utilities.getUuid()`, with separators removed and lowercase normalization. The accepted contract is exactly 32 hexadecimal characters. A conforming version-4 UUID provides approximately 122 random bits, is non-sequential, contains no JobID, customer data, spreadsheet identifier, or other business data, and is impractical to enumerate.

Each persisted record binds the token to exactly one `JobID` and one `Workflow ID`. A token for one Job returns the same generic unavailable response when presented for another Job. Workflow transition rules continue to constrain the actions available after resolution. Repeated scans are reads and append no audit event; mutation command IDs retain their existing idempotency behavior.

## Lifecycle policy

- **ACTIVE**: the record has no `Revoked At`; it may locate its bound Job while that Job/workflow permits the requested operation.
- **REVOKED**: `Revoked At` and `Revoked By` are retained. The token never becomes active again.
- **EXPIRED**: not introduced. Printed travelers may remain useful for the practical life of a work item, so a short automatic expiration would disrupt normal work without an established retention policy.

Tokens should be revoked when a traveler is lost, replaced, exposed outside its intended operational context, or otherwise retired. Completion does not silently erase the locator or history, but completed-work mutation is rejected by workflow/state rules. If future policy requires expiry, add it through an additive schema and define traveler behavior before activation.

Rotation generates and validates a new independent token, revokes the old token, creates the replacement for the same Job/workflow, and appends a `QR_ROTATED` event. Explicit revocation appends `QR_REVOKED`. Reissue never changes canonical Job identity and never reactivates an old value. Lifecycle methods remain server-only until a capability-gated administrative endpoint exists.

## Persistence

No schema/header addition is required. Existing `JobQrTokens` fields already provide the durable minimum:

- QR Token
- JobID
- Workflow ID
- Created At / Created By
- Revoked At / Revoked By

Active/revoked state is derived from `Revoked At`. Existing records remain compatible and no production data rewrite is required. `Created By` and `Revoked By` must be supplied by authoritative `AuditContext` after identity enforcement; historical values are not rewritten.

## Error and information handling

Malformed, unknown, revoked, and wrong-Job tokens all fail with the same operator-safe message. The response does not disclose adjacent tokens, sheet layout, Job details, or stack traces. Traveler view models omit the raw token. The QR payload contains only the application scan URL and opaque token; no Job/customer/Sheet identifier is embedded directly.

## Activation dependencies

Before production QR mutation is approved:

1. Implement the MOS-121 authenticated-principal, active membership, tenant, capability, and immutable audit-context gate at the canonical mutation boundary.
2. Require named operator identity; limit kiosk identities to documented low-risk capabilities.
3. Keep QR lifecycle administration behind explicit capabilities and recent-auth policy where appropriate.
4. Validate the deployed QR image-rendering and logging path does not retain locator URLs beyond approved operational needs.
5. Run controlled non-production scans, revoke/reissue tests, cross-Job denial tests, and operator-attribution tests before traveler reprinting or production activation.

No production tokens were rotated, travelers reprinted, schema changed, or deployment configuration modified by MOS-121D.
