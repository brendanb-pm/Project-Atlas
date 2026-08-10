# MOS-121E — Input Safety and Client-Safe Error Boundaries

Release channel: **MAIN**

Baseline: `e9bd6b9474c67cddccd8cc3a5af537f2ec0924ea`

## Write-boundary audit

All current business persistence paths for MVP records, CRM/SalesActivity, FollowUps and calendar records, Ideas, JobEvents/QR metadata, ProcessTrials, purchasing, cash receipts, RFQ staging/AI-approved records, and document metadata ultimately use `SheetsRepository.insert()` or `updateById()`. These methods used `appendRow()` and `setValue()` with strings unchanged. Consequently, user, email, AI, import, and provider-derived strings beginning with a Sheets formula trigger could be interpreted as formulas.

The only other direct `setValues()` calls initialize known, source-controlled header rows for Ideas and operational persistence. No production source uses `setFormula()` or `setFormulas()`, and no legitimate system-generated formula field was found. Header initialization therefore remains outside the untrusted-business-text boundary.

## Central formula-safety contract

`SheetsRepository` now applies `toSafeSheetsCellValue_()` immediately before every business insert or update. Strings beginning, after optional leading spaces/control whitespace, with `=`, `+`, `-`, or `@` receive the Sheets literal-text marker (`'`). Google Sheets displays and returns the intended text without the marker, so a value such as `=SUM(A1:A3)` remains visibly and semantically `=SUM(A1:A3)` rather than executing.

The policy is type-aware:

- strings, including IDs and enums, are literal values; only formula-triggering strings receive the marker;
- numbers remain numbers;
- booleans remain booleans;
- `Date` values remain dates and are serialized only when returned to clients;
- no formula exception exists because Atlas currently has no intentional formula fields.

Because `getValues()` returns the visible literal value, editing and saving the record again does not accumulate markers. No production data rewrite is required. Existing cells containing executable formulas are not modified by this story; any remediation of historical production content requires a separately authorized assessment and migration.

## External inputs

The same repository boundary covers browser forms, Gmail/RFQ intake, AI-extracted proposals after human approval, provider-derived fields, and future imports that use the repository contract. AI output is not trusted. New storage adapters must provide equivalent literal-text semantics rather than depending on the Sheets marker itself.

## Rendering/XSS audit

Operator screens using dynamic `innerHTML` were inspected: Index, SalesActivity, Ideas, Calendar FollowUps, Operations Dashboard, Shop Floor, and Traveler. Stored user-facing text is passed through existing HTML-escaping helpers before interpolation; status-only rendering uses source-controlled constants. Direct form/status updates use `textContent` where appropriate. A regression test executes the Ideas escaping helper against a representative scriptable HTML payload.

No demonstrated stored-XSS path was found in the audited user-text rendering. Canonical IDs are sometimes placed in attributes or inline handlers; they are system-generated rather than untrusted business text. This is not treated as an active XSS issue, but future externally supplied identifiers must not inherit that assumption.

## Client-safe error contract

All callable functions in `UI/Code.gs` already catch service/repository exceptions through `toClientError_()`, but the previous implementation returned every raw exception message. Configuration failures could expose worksheet names, headers, Script Property names, and other implementation details; unexpected/provider exceptions could expose paths, identifiers, or stack content.

The centralized contract now returns:

- `VALIDATION_ERROR`: operator-actionable validation text;
- `AUTHORIZATION_ERROR`: permission-safe wording;
- `NOT_FOUND`: generic missing-record wording;
- `CONFLICT`: refresh-and-review guidance;
- `CONFIGURATION_UNAVAILABLE`: generic configuration wording;
- `PROVIDER_UNAVAILABLE`: generic connected-service wording;
- `INTERNAL_ERROR`: generic unexpected-failure wording.

Every error includes a safe `ERR-…` reference ID. Server diagnostics log that same reference with the internal code, exception type, diagnostic message, and stack. Common bearer/token/password/secret/API-key patterns are redacted before logging. The client never receives raw exception serialization or stack data.

Validation messages remain visible because they drive form correction. Services must continue to keep validation messages operator-safe; internal configuration and provider failures must use their corresponding error category. Unknown outcomes still require authoritative refresh/reconciliation rather than blind resubmission, consistent with repository governance.

## Findings

| Severity | Finding | Result |
|---|---|---|
| HIGH | Shared business writes allowed formula-leading untrusted strings to reach Sheets unchanged. | Fixed centrally for inserts and updates. |
| HIGH | Raw configuration/repository/provider/internal exception messages crossed the browser boundary. | Fixed with categorized safe responses and correlation IDs. |
| MEDIUM | Server diagnostics could accidentally record common credential patterns embedded in exceptions. | Fixed with diagnostic redaction while retaining correlation and stack context. |
| LOW | The legacy single-line SalesActivity view still displays the Apps Script transport failure message when a call fails before the normal endpoint response contract. All invoked endpoints catch application errors, so repository/configuration details use the safe contract; the residual concerns platform/serialization failures. | Defer formatting and consolidating that legacy client transport wrapper to focused UI maintenance rather than rewriting the whole view in this security patch. |
| NO ISSUE | Intentional system formula fields. | None exist in current MAIN. |
| NO ISSUE | Demonstrated stored XSS in audited operator text fields. | Existing UI escaping was confirmed and regression-tested. |

## Remaining dependencies

MOS-121B/C identity enforcement remains required. Input and error hardening does not authenticate callers, establish membership, authorize capabilities, or make client actor fields authoritative. Production access remains unapproved until the trusted request-context and mutation gate are implemented and validated.

No production Sheets, records, Script Properties, credentials, integrations, or deployments were changed.
