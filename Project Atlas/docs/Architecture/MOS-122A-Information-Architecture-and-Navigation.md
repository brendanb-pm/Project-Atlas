# MOS-122A Information Architecture and Navigation

Release channel: **MAIN**
Baseline: `e9dc888156fdd981c1cf9b8b54c138bbf7b5ee39`

## Implemented boundary

Atlas now has one provider-neutral navigation registry and one read-only navigation model. The model composes only trusted authorization context, deployment presentation configuration, supported routes, and enabled-module metadata. It never calls `getMvpBootstrap`, reads business collections, or authorizes an operation merely because a link is visible.

The shared frame contract provides tenant/deployment identity, current location, Home/Command Center access, grouped business navigation, loading fallback, active-page indication, keyboard-visible focus, 44-pixel targets, and a compact single-column menu below 600 pixels. MOS-122B still owns the full design system.

## Information architecture

| Group | Implemented supported destinations |
| --- | --- |
| Home | Command Center; Ideas |
| CRM | Customers; Sales Activity; Follow-Ups |
| Commercial | RFQs; Quotes |
| Operations | Jobs / Work Orders; Shop Floor; Operations Dashboard |
| Finance | Invoices |

Purchasing, Cash Receipts, Documents, Process Trials, specialty modules, and Admin/Settings remain named architectural groups but are not emitted until a supported production page exists. This avoids inventing routes or presenting static prototypes as production UI.

Customer remains the Atlas Core term. Job remains canonical; `Jobs / Work Orders` is the operator-facing navigation label. Follow-Up is the UI term. Existing service/entity names are unchanged.

## Route model and compatibility

Canonical routes use `?route=<route-id>`:

- `home`, `customers`, `sales-activity`, `follow-ups`
- `rfqs`, `quotes`
- `jobs`, `shop-floor`, `operations-dashboard`
- `invoices`, `ideas`
- contextual `traveler`

The prior query parameters remain aliases:

- `?sales=1` -> `sales-activity`
- `?calendar=1` -> `follow-ups`
- `?shop=1` -> `shop-floor`
- `?dashboard=1` -> `operations-dashboard`
- `?ideas=1` -> `ideas`
- `?traveler=...` and `?qr=...` -> contextual traveler

Unknown routes fail safely to the default Index/Command Center template. Bookmarks continue working. RFQ Intake Review and Quote Preparation templates remain reference artifacts and are not registered as production routes.

## Capability and module behavior

Each route declares the capability needed to present it. The navigation service filters against the immutable capabilities supplied by the MOS-121 authorized execution context. Server endpoint authorization remains authoritative; client visibility is only usability guidance.

`ATLAS_DEPLOYMENT_PROFILE` is an optional JSON Script Property read by the presentation boundary:

```json
{
  "productDisplayName": "VMOS",
  "organizationName": "Vitality Manufacturing",
  "deploymentDisplayName": "Production",
  "enabledModules": ["FIREARMS"]
}
```

No property is created or changed by the application. When absent, the UI falls back to neutral `Atlas`. Malformed configuration fails safely. Enabled modules are normalized and returned, but no Firearms or Coatings route is shown because no supported module page is registered. A future module contributes routes to the same registry; it does not replace Core or make MAIN depend on Asana.

## Page-frame migration

Sales Activity, Follow-Up Calendar, Shop Floor, Operations Dashboard, Ideas, and Traveler use the shared compact frame. The default Index uses the same navigation model in its existing responsive sidebar to avoid a nested second frame. The frame loads independently from business data, so navigation remains available while a screen payload loads or fails.

The Index preserves its current business screens and bootstrap behavior; MOS-122A does not implement the MOS-120 read-model migration. Canonical routes select its supported Customer/RFQ/Quote/Job/Invoice section directly and update URL/focus when moving locally.

## Activation, rollback, and safety

The configuration is additive and read-only. No schema, production property, deployment, provider, or business data is changed. Rollback is code-only: revert the route/model/frame changes; legacy aliases remain independently documented.

Before configuring a tenant-specific profile, validate the JSON in non-production. Long names wrap rather than overflow; rendered device validation remains MOS-122H evidence.

## Remaining UX debt

- `getMvpBootstrap` still powers the default entity shell and Sales customer selector.
- Page-specific CSS, async wrappers, and feedback patterns remain duplicated until MOS-122B and later workflow stories.
- Static RFQ/Quote prototypes are not production routes.
- Purchasing, Cash Receipts, Documents, Process Trials, Admin/Settings, and specialty module pages do not yet exist.
- The shared frame has code-level responsive/accessibility validation only; no rendered device or assistive-technology pass occurred.
- The Command Center remains a data/entity summary rather than the future persona-prioritized Daily Work model.
