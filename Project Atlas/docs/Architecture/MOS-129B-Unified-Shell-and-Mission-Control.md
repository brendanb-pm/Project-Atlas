# MOS-129B Unified Shell and Mission Control

Release channel: **MAIN**

Baseline: `ffd0bc16a607ab599c8cced0d4dfd535ef40d392`

## Implemented slice

- A tenant-neutral shell provides grouped, capability/module-filtered navigation, configured deployment identity, readable session context, active location, desktop collapse, mobile drawer behavior, and a persistent Command/Search trigger.
- Presentation persona is inferred only from authoritative capabilities. Owner/manager uses Mission Control; shop-only operators default to Shop Floor; administration-only users default to Tenant Administration; sales, purchasing, and finance remain on role-relevant Mission Control until My Work exists. Unknown personas use neutral Mission Control.
- The existing Command Center bounded orchestration becomes Mission Control. Attention and exceptions precede today/role queues, supporting metrics, and recent reference information. Partial source failure remains isolated.
- Command/Search performs a minimum-two-character, maximum-15-result, tenant-filtered, capability-filtered server read. It supports Customer, RFQ, Quote, Job, Invoice, Purchase Request, Vendor, and enabled Firearms records where the caller has the corresponding capability. The client debounces requests and rejects superseded success and failure callbacks.

Navigation visibility remains presentation only. Every destination and search request re-enters the existing authoritative route or callable authorization boundary. Command/Search performs no mutations.

## Recovery and accessibility

The palette owns its own request generation and `aria-busy` state. Close invalidates in-flight requests. Errors and no-results are stable, retryable states. Keyboard behavior includes Ctrl/Cmd+K, Escape, arrows, Enter, focus restoration, and explicit selection; the first result is never selected automatically. Shell controls retain accessible names and 44-pixel targets, and reduced-motion behavior is defined.

## Performance boundary

Browser payloads are bounded and no global directory or `getMvpBootstrap` was added. The current Sheets repositories for several entity types still implement their server-side search by reading and filtering a tenant collection before the service returns at most 15 summaries. This is existing MOS-120 adapter/read-model debt, not a browser payload or N+1 regression. A future adapter optimization may add indexed/paged repository search without changing this service contract.

## Deferred scope

Job Record Canvas, My Work, command mutations, broad domain UI migration, and adapter optimization remain outside MOS-129B. No schema, data, deployment configuration, or production resource is changed.
