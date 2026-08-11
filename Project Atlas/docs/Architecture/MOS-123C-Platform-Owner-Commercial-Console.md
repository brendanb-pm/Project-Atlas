# MOS-123C — Platform-owner commercial console

Status: code and contract complete; rendered local inspection performed at 1280×720 with synthetic data; required 1440×900, 1024×768, and 768×1024 viewport acceptance remains partial; production activation not performed.

The `Platform Administration` route is visible only when the authoritative Atlas context contains `PLATFORM_TENANT_READ`. It is distinct from tenant `Admin / Settings`; `ADMIN_CONFIG` and `ADMIN_IDENTITY` do not reveal the route or authorize its endpoint. The workspace uses normal Atlas authentication, never a client-selectable super-admin claim, and does not create tenant membership or impersonate tenant users.

The bounded model returns at most 50 tenants per request (repository hard cap 200) and exposes tenant, plan, subscription/trial state, purchased/in-use/available/overage seats, self-service cap, subscribed module keys, billing frequency/anchor/next date, safe payment category/status, attention states, and five recent commercial changes. It does not return payment credentials, provider secrets, all invoice history, or raw storage details.

Desktop is the primary context; tablet layouts stack the search controls and metrics, while narrow layouts use a single metric column. Search is keyboard operable, active status and errors use text rather than color alone, dynamic values are HTML-escaped, and results announce changes through a polite live region. The UI uses the shared Atlas shell and design tokens.

Manual cross-tenant mutations remain intentionally absent. Future seat, module, trial, suspension, and override actions require their individual platform capabilities, current/proposed value preview, explicit confirmation, reason, MOS-121 recovery classification, and authoritative commercial audit.

The platform screen is a management/attention view, not the tenant self-service account area. Tenant Admin users must later receive own-tenant Account, Users, Seats, Modules, Billing Information, and Billing History surfaces without access to this route.
