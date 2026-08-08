# Atlas Productization Foundation

## DeploymentProfile contract

`DeploymentProfile` is deployment configuration, not multi-tenancy. It includes identity (organization name, deployment name/key), branding (logo references, palette, light/dark assets, optional typography), module/integration keys, terminology, default/specialty workflow references, and non-secret feature flags. It deliberately excludes API keys, tokens, Script Properties, Sheets mappings, and provider credentials.

VMOS profile enables CRM, RFQ/Quotes, Manufacturing, Purchasing, Invoicing, Process Learning, Firearms, and Coatings. Its integrations are declared planned, not connected. Vitality colors and specialty workflow references live in this profile.

IPM profile enables only generic manufacturing modules. Firearms, Coatings, and integrations are absent. Unknown brand colors resolve to neutral defaults only for prototype presentation. Ricardo must supply branding, terminology confirmation, default workflow, payment terms, users/access, and import/start-empty choice before any pilot configuration.

## Module registry

Each declaration has key, display name, navigation entries, required core capabilities, optional integrations, workflow references, and routes. Platform Core reads declarations; it does not import specialty behavior. Firearms and Coatings consume Job/Document/Workflow contracts through extension records.

## Generic presentation and quote portability

The beta resolver returns all user-facing identity, terminology, navigation, colors, and command cards from a profile. The beta quote presentation model accepts a profile plus quote data and exposes seller/branding/quote fields to a portable template. VMOS may show Vitality; IPM output has a negative test for Vitality, VMOS, Firearms, and Cerakote contamination.

## Workflow cleanup plan

Keep current VMOS workflow behavior stable. Introduce `ATLAS_GENERIC_MANUFACTURING` for generic defaults; retain Vitality Firearms and Vitality Coatings as specialty workflow references. First promote configuration contracts and tests; then add compatibility aliases around current VMOS workflow configuration; only after VMOS stabilization move Cerakote defaults out of shared workflow code. No existing workflow is rewritten by this beta work.

## Coupling inventory

| Item | Classification | Disposition |
|---|---|---|
| UI routes/titles, Index, Ideas, dashboard, shop floor, traveler | MOVE TO TENANT CONFIG | Pilot blocker for generic shared UI. |
| QuoteTemplate Vitality string | MOVE TO TENANT CONFIG | Beta portable template proves replacement path. |
| `CERAKOTE` shared default | MOVE TO MODULE CONFIG | Remove only with compatibility migration. |
| `MvpService`, `getVmosConfig_`, script property names | LEGITIMATE INTERNAL IDENTIFIER for now | Rename behind aliases later; do not jeopardize activation. |
| Job/Customer/RFQ/Quote/Invoice labels | GENERIC PLATFORM TEXT | Keep unless terminology resolver overrides presentation. |
| VMOS activation/deployment documents | DEFER | Correct for VMOS, not IPM-facing UI. |

## Storage adapter audit

The intended core `SheetsRepository` boundary is sound for core entities. Direct adapter selection remains in `CashReceiptRepository`, `PurchaseApprovalRepository`, `IdeasRepositories`, `OperationalRepositories`, `ProcessTrialService`, `ConfigIdeas`, and `OperationalPersistence`.

| Classification | Findings |
|---|---|
| BLOCKS IPM PILOT | `ProcessTrialService` directly creates `SheetsRepository`; generic pilot composition cannot choose another adapter. Current shared UI also bootstraps VMOS-specific services. |
| SHOULD FIX BEFORE THIRD TENANT | Cash Receipts, Purchase Approvals, Ideas, operational repositories/configuration, and operational persistence select Sheets directly. |
| ACCEPTABLE CURRENT IMPLEMENTATION | `SheetsRepository` itself and VMOS-only activation functions; VMOS can remain Sheets-backed while interfaces are extracted. |

Small beta-only improvement: all new profile, registry, quote-presentation, and native-board prototype services are storage independent. No SQL or data migration is proposed.
