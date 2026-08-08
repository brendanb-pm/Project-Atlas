# Beta-to-Main Promotion Plan

Do not merge this branch. Promotion is selective after VMOS production activation is validated.

| Order | Capability | Files / dependencies | Risk | Tests | Recommendation |
|---|---|---|---|---|---|
| 1 | VMOS activation and stabilization | Existing main only | Low change / high operational importance | Existing production smoke checks | Finish before any portability work. |
| 2 | DeploymentProfile + module registry | `AtlasTenantConfig.gs`, `AtlasModuleRegistry.gs`, concept tests | Low | profile/module/contamination tests | Clean reimplementation on main is safer: current beta resolver carries demo concepts. |
| 3 | Presentation/terminology resolver | Profile contract plus shared UI composition | Medium | tenant render tests | Reimplement incrementally on main; retain VMOS defaults. |
| 4 | Quote presentation model | `AtlasQuotePresentationService.gs`, `AtlasQuoteTemplate.html` | Low-medium | quote portability test | Cherry-pick candidate after adapter review; no storage migration. |
| 5 | Workflow configuration split | generic default + specialty module configs | Medium-high | no-Cerakote IPM workflow tests plus VMOS regression | Reimplement with compatibility aliases; do not cherry-pick wholesale. |
| 6 | Firearms UX | existing Firearms architecture plus module registry/presentation | Medium | module isolation + Firearms tests | Promote only after core presentation boundary is present. |
| 7 | Asana integration | existing adapter contracts | Medium | idempotency/reconciliation tests | Keep disabled until VMOS workflow stabilization. |
| 8 | Customer notifications | rules/events/provider adapters | Medium-high | dedupe/delay/cancellation tests | Keep disabled; require operational policy approval. |
| 9 | IPM pilot preparation | storage interface extraction, repeatable setup, usability test | High | pilot configuration and observational test | Reimplement composition root; never copy VMOS activation settings. |

The native Kanban/floor-board/first-run UI stays beta BACKLOG. It is a useful product direction but not safe to cherry-pick until a generic transition command and live-refresh/concurrency model exist.
