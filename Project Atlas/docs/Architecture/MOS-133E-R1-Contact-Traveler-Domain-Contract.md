# MOS-133E-R1 — Contact and Traveler Domain Contract

**Status:** superseded for Contact by the approved MOS-133E-R2 product contract;
Traveler contract remains accepted.

This R1 evidence record created no schema, migration, repository, data conversion,
or production change. Its Contact conclusion is superseded only by the explicit
R2 product decision; the Traveler evidence and decision remain authoritative.

## Contact evidence and decision

`Customer` is the current canonical account record. Its mapped fields include a
free-form `primaryContact` display value plus customer email and phone. RFQ and
Sales Activity mappings contain optional `ContactID` values, but the repository
contains no Contact repository, Contact mapping, Contacts sheet definition, or
Contact lifecycle service. The Sales Activity architecture explicitly describes
`ContactID` as an optional future reference; it does not establish a Contact
model.

**Original evidence conclusion:** `ContactID` alone did not establish a Contact
aggregate. **R2 product decision:** Contact is now an approved first-class,
tenant-owned CRM entity subordinate to exactly one Customer. Its stable canonical
ID is `CONTACT-<UUID>`; `CustomerID` is required; normal deletion is archive-only;
and it may not be reparented in an ordinary update. The canonical field set is
`ContactID`, `TenantID`, `CustomerID`, `DisplayName`, `Email`, `Phone`,
`TitleRole`, `Status`, `Version`, `CreatedAt`, and `UpdatedAt`.

### Migration implications

- A resolved historical `ContactID` may become a relational FK only after a
  deterministic accepted canonical-Contact match.
- Blank values become `NULL`. Orphan/unresolvable values are retained as
  migration/reconciliation evidence and reported, never silently attached to a
  Customer or synthesized into a Contact.
- `Customer.primaryContact` remains display text. It must not become a Contact ID
  and cannot by itself create a Contact row.
- Duplicate contact-like names, emails, and phones require a later approved
  matching/reconciliation policy; no automatic deduplication is authorized.

The approved R2 contract requires no uniqueness on email, phone, display name, or
title. RFQ and Sales Activity `ContactID` remain optional; when populated they
must be same-tenant and Customer-consistent. `Customer.primaryContact` remains
legacy Customer-owned display text, not Contact identity and never an automatic
Contact source.

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
- Create the approved Customer-owned Contact schema and relational foreign keys;
  leave legacy-contact reconciliation to MOS-133F/G tooling.
- Do not conflate traveler rendering with a persisted business aggregate.

## Open decisions

1. Whether future operations require first-class work-step records beyond Job
   workflow state and Job Events.

MOS-133E-R2 resolved the Contact blocker. The Traveler decision itself remains
sufficient for the demonstrated operational model.
