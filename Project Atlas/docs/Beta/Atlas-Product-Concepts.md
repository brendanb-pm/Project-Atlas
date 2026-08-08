# Atlas Product Concepts — Weekend Beta

This branch is an isolated product-concept experiment. It is not a VMOS production deployment or activation artifact.

## Tenant / brand configuration — PROMOTE

**Hypothesis:** one application can render distinct small-manufacturing deployments from an explicit tenant contract. **Prototype:** `AtlasTenantConfig.gs` has VMOS and IPM configurations for identity, colors, appearance, terminology, modules, integrations, and workflow. **Worked:** a single UI switches all visible labels, navigation, color accent, and workflow columns. **Failed:** configuration is demo data, not a durable tenant-administration system. **Coupling:** existing shared UI/template text remains VMOS-branded outside the beta surface. **Recommendation:** PROMOTE the contract and configuration resolver; BACKLOG persistence/admin UX.

## Modular navigation — PROMOTE

**Hypothesis:** enabled modules can generate a comprehensible menu. **Prototype:** core/manufacturing items are generated first; Firearms and Coatings appear only when enabled. **Worked:** IPM has neither specialty module or coating workflow. **Failed:** group headings/permissions are not modeled. **Coupling:** current production Index navigation is still hard-coded. **Recommendation:** PROMOTE module registry/navigation resolver; BACKLOG roles/permission policy.

## Native Atlas Kanban / floor board — BACKLOG

**Hypothesis:** the Atlas Workflow Engine can power a visual execution board independent of Asana. **Prototype:** drag/drop asks for only an adjacent configured transition or an exception state; rejected moves stay visible and show a reason. Large-display view and 10-second New Work overlay reuse the model. **Worked:** the concept keeps canonical status client-owned only in demo state and does not require Asana. **Failed:** no durable transition command, concurrency control, or live refresh. **Recommendation:** BACKLOG after extracting the generic workflow engine; it can coexist with Asana because both are adapters requesting the same canonical transition.

## Firearms tablet — PROMOTE UX, BACKLOG implementation

**Hypothesis:** a focused tablet flow is faster than generic ERP navigation. **Prototype:** Customer → Item → Requested Work → Optic/Parts → Condition → Photos → Authorization → Review. **Worked:** no raw IDs, touch-size controls, portrait stacking, module-specific data language. **Failed:** photos/signatures are placeholders and no module repository is activated. **Coupling:** the production Firearms workflow contract was corrected to use extension records, but it still needs a durable module repository. **Recommendation:** PROMOTE the information architecture; BACKLOG production UI/service activation.

## Command Center and onboarding — PROMOTE UX, BACKLOG data

The Command Center uses actionable queues rather than revenue claims. Cards appear only for enabled modules. The onboarding flow hides Sheets, Apps Script, clasp, JSON, and database terms. It needs later real setup orchestration.

### Manual deployment steps the future setup must replace

The current VMOS activation asks an owner to handle spreadsheet IDs and headers, Script Properties, clasp/project linkage, Apps Script authorization/deployment, web-app access, Gmail labels, Drive roots, triggers, provider keys, QR URL configuration, workflow JSON, and separately created operational tabs. The eventual setup experience must collect plain-language organization/workflow/module/integration choices, validate them, provision approved storage/configuration through an administrative service, and present safe import/start-empty options. It must not simply expose those technical settings in a friendlier-looking form.
