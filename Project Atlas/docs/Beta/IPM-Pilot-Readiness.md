# IPM Pilot Readiness

## Result: BLOCKED FOR LIVE PILOT — concept portability passes

The IPM demo configuration can conceptually support Ricardo creating a customer/RFQ, preparing a quote, creating a Job, viewing workload, updating status, recording process learning, and invoicing without displaying Vitality, VMOS, Firearms, or Cerakote in configured prototype output. Automated negative tests enforce that boundary.

| Finding | Classification | Impact / next action |
|---|---|---|
| Main MVP UI and quote template contain VMOS/Vitality presentation text | BLOCKER | Extract tenant/brand resolver before exposing main UI to IPM. |
| Shared workflow defaults contain `CERAKOTE` | SHOULD FIX | Move specialty workflow templates into Coatings module config. |
| `MvpService` / `getVmosConfig_` are generic behavior with VMOS names | SHOULD FIX | Rename/extract incrementally behind compatibility aliases. |
| Some operational services select Sheets repositories directly | SHOULD FIX | Inject repository/storage adapters at composition boundary. |
| Firearms extension model is designed but lacks durable module storage | FUTURE | Activate only for VMOS after schema/config approval. |
| Asana / Gmail / Drive / AI are optional adapters | PASS | IPM config enables none and has no UI leakage. |
| Role-based module visibility and real onboarding | FUTURE | Add after module registry is promoted. |

Legitimate internal-code exceptions: VMOS and Vitality names remain in existing deployment-specific configuration, tests, and migration documentation. The IPM-facing beta rendered/configured payload is clean; that is what the negative test evaluates.

## Productization scorecard

| Category | Status | Evidence / remaining work | Pilot blocker |
|---|---|---|---|
| Tenant identity isolation | PARTIAL | Beta profile resolves identity; shared main UI is hard-coded. | Yes |
| Brand isolation | PARTIAL | Beta quote model works; main quote template is branded. | Yes |
| Module isolation | READY | Registry/test removes Firearms and Coatings from IPM. | No |
| Data isolation | BLOCKED | Current app is a VMOS Sheets deployment, not repeatable pilot composition. | Yes |
| Workflow isolation | PARTIAL | IPM beta has generic workflow; shared default retains CERAKOTE. | Yes |
| Quote portability | PARTIAL | Beta model/template exists; production renderer remains hard-coded. | Yes |
| Navigation portability | PARTIAL | Beta is module-driven; main Index is fixed. | Yes |
| Storage isolation | BLOCKED | Multiple services select Sheets adapter directly. | Yes |
| User/access isolation | BLOCKED | No tenant-neutral role/access composition. | Yes |
| Deployment repeatability | BLOCKED | Current process requires technical activation steps. | Yes |
| Support burden | PARTIAL | Ricardo test plan exists; no observed evidence. | Yes |
| Terminology portability | PARTIAL | Beta resolver/test works; main labels remain VMOS. | Yes |
