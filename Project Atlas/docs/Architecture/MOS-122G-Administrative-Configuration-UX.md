# MOS-122G Administrative / Configuration UX

Atlas now has a tenant Admin / Settings route distinct from any future platform-owner commercial console. Navigation appears only for `ADMIN_CONFIG` or `ADMIN_IDENTITY`; the two server reads remain independently capability protected.

`getAdminWorkspace` composes tenant-safe presentation, enabled optional modules, calendar state, and the ACT1 activation-health diagnostic. Technical source conditions are translated to Ready, Disabled, Setup required, or Attention required. It returns no Script Property names, worksheet headers, repository mappings, resource IDs, provider credential references, or audit-ledger internals.

`getAdminIdentityWorkspace` requires `ADMIN_IDENTITY`, tenant-filters memberships server-side, bounds the result to 100 by default (200 maximum), joins display/status data, summarizes roles and explicit capability count, and reports only whether an active external identity link exists. It never returns the provider subject/email. Roles are presented as bundles; no arbitrary capability editor, password workflow, impersonation, or mutation was introduced.

The responsive workspace is desktop/tablet first with a readable mobile health fallback. Current implementation is intentionally read-only: configuration mutations require separate authoritative contracts with confirmation, impact, recent-auth policy, audit, idempotency, and recovery before controls may be enabled.

Local security and UI contract tests cover capability separation, tenant filtering, module/branding/integration states, safe health language, identity linkage presentation, internal-detail exclusion, and responsive behavior. Live identity provisioning and rendered multi-persona validation remain activation gates.

No production resource changed.
