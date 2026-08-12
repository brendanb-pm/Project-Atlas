# MOS-126D — Contextual Quote Builder and Record Pickers

**Baseline:** `20ef2a328f6795e90f5ed429140517c750c89cd1`

The routed Quote Builder separates Quote header, customer pricing, internal costing, suppliers, source documents, summary/margin, and lifecycle. Customer preview is rendered solely from customer fields. Internal estimates, Vendor detail, markup, margin, internal notes, and private source documents never enter that projection.

Reusable bounded picker behavior supports Customer, eligible RFQ, and Vendor. RFQs are tenant-scoped, newest-first, searchable by RFQ number, Customer, project, and description, exclude already-quoted RFQs, and accept Customer contextual filtering. The server revalidates canonical relationships on the existing create command; picker selection is convenience, not authority. Search is debounced, bounded to 50 by default, keyboard navigable, and touch-sized.

The Quote Builder preserves entered browser values on recoverable transport failure and distinguishes loading, no matches, validation, uncertain result, and saved state. Internal costing is optional; an explicit non-blocking warning remains visible when absent. Dense costing is optimized for desktop/tablet; mobile retains contextual review and simple inputs without horizontal overflow.

Operator-memory audit: Customer, RFQ, and Vendor are **FIXED** with human-readable bounded selectors. Known business numbers remain useful search input but are not required. Part, Job, Invoice, and source-document selectors are **DEFERRED** because this story does not add those relationships to the current Quote draft command; existing contextual commercial screens continue to provide their human-readable navigation.

No production deployment, workbook, schema, provider, or data was changed. Real Apps Script/Sheets timings and live/physical-device acceptance remain separate activation evidence.
