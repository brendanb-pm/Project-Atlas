# MOS-122F CRM / Sales UX Operationalization

The Sales Activity route now uses CRM-specific bounded reads rather than `getMvpBootstrap`. `SalesWorkspaceService_` returns a searchable Customer directory capped at 100 by default (200 hard maximum) and a Customer workspace containing identity, owner where available, stale-account health, the nearest next action, and the 50 most recent activities (100 hard maximum).

The existing rapid-entry interaction remains canonical: Log Visit, Log Call, Log Text, Log Email, Materials Left, and Follow Up populate the MOS-115 activity type; open work still requires Next Action and Due; material drop-off retains material type and quantity; server-created actor attribution remains authoritative. Successful save clears only the activity notes after confirmation. Recoverable failures retain the form, and uncertain outcomes instruct authoritative refresh instead of blind resubmission.

The selected Customer context now makes account health and Next Action / Due / Owner visible before the bounded chronological timeline. Mobile retains a one-column form with 44–48 pixel controls and wrapping quick actions at 390x844. Capability enforcement remains server-side through `SALES_READ` and `SALES_WRITE`; presentation does not grant access.

The current Sheets adapter still performs application-side filtering internally. This story bounds browser payloads and establishes the domain contract; MOS-120 adapter work remains necessary to avoid physical full-sheet scans at scale. Real under-30-second observation, live rendered viewport validation, and Apps Script/Sheets timings remain MOS-122H evidence.

No production resource changed.
