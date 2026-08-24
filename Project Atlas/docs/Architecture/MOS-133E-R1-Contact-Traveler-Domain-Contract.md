# MOS-133E-R1 — Contact and Traveler Domain Contract

**Status:** CONTACT REQUIRES PRODUCT DECISION; TRAVELER CONTRACT RESOLVED.

This record resolves only the evidence needed to continue PostgreSQL schema work
safely. It creates no schema, migration, repository, data conversion, or
production change.

## Contact evidence and decision

`Customer` is the current canonical account record. Its mapped fields include a
free-form `primaryContact` display value plus customer email and phone. RFQ and
Sales Activity mappings contain optional `ContactID` values, but the repository
contains no Contact repository, Contact mapping, Contacts sheet definition, or
Contact lifecycle service. The Sales Activity architecture explicitly describes
`ContactID` as an optional future reference; it does not establish a Contact
model.

**Decision: D — unresolved legacy/future reference.** `ContactID` is not proof
of a first-class Contact aggregate, a customer-owned entity, or a stable external
identifier. Atlas must not create a PostgreSQL `contact` table, a Contact foreign
key, or synthetic contact records from it in MOS-133E.

### Migration implications

- Preserve a nonblank historical `ContactID` as an opaque legacy value during a
  future export only after its source meaning is recorded; do not resolve it as a
  relational foreign key.
- Blank values remain blank. Orphan/unresolvable values are retained for
  reconciliation and reported, never silently attached to a Customer.
- `Customer.primaryContact` remains display text. It must not become a Contact ID
  and cannot by itself create a Contact row.
- Duplicate contact-like names, emails, and phones require a later approved
  matching/reconciliation policy; no automatic deduplication is authorized.

### Required decision before Contact schema work

Define whether Contact is first-class or customer-owned, its canonical ID source,
tenant and Customer ownership/nullability, demonstrated fields, active/archive and
version behavior, permitted reparenting/deletion, uniqueness/search policy, and
the migration/reconciliation policy for legacy `ContactID` values. Until then,
RFQ and Sales Activity may retain the opaque legacy field outside relational
authority.

## Traveler / operations evidence and decision

The traveler route and printable UI are generated from a Job, an active opaque QR
token, workflow configuration, and Job Events. Shop Floor rejects duplicate active
QR assignment and reprints from the existing token. Job is the mutable current
operational state; Job Events are append-only operational history. Operational
persistence currently defines Job Events and Job QR Tokens, not a Traveler
repository or Traveler lifecycle aggregate.

**Decision: B — Traveler is a projection/view over Job + workflow + Job Events +
QR token.** It has no independent canonical identity, archive lifecycle, revision
sequence, or authority boundary.

### Authoritative operational contract

| Concern | Canonical source |
| --- | --- |
| Current work-order state, owner, due date, current operation/readiness | Job |
| Workflow assignment and permitted status interpretation | configured workflow referenced by active QR token |
| Transition, problem, block, assignment, and QR history | append-only Job Event |
| Print/scan reference and revocation/rotation lifecycle | opaque Job QR Token |
| Traveler UI/print document | projection regenerated from the above |

The PostgreSQL schema later needs tenant-scoped `job`, append-only `job_event`,
and revocable `job_qr_token` records with tenant-safe Job relationships. It must
not invent a `traveler` table, TravelerID, Traveler versioning, or a second source
of operational state. A future true operation/work-step aggregate remains a
separate product decision; current workflow states and Job Events do not establish
one.

## MOS-133E schema implications

- Implement the demonstrated Job / Job Event / Job QR Token model with explicit
  TenantID and tenant-safe relationships.
- Preserve the current-state/history split: mutable Job state and append-only Job
  Events. QR rotation revokes the old opaque token and creates a replacement.
- Do not add Contact tables or relational Contact foreign keys before the required
  Contact decision.
- Do not conflate traveler rendering with a persisted business aggregate.

## Open decisions

1. Contact canonical domain contract and legacy-contact reconciliation policy.
2. Whether future operations require first-class work-step records beyond Job
   workflow state and Job Events.

MOS-133E remains blocked only on decision 1 for Contact-dependent foreign keys;
the Traveler decision itself is sufficient for the demonstrated operational model.
