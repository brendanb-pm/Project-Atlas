# ADR: Atlas Platform Modularity

## Context

Project Atlas is a configurable, industry-agnostic lightweight CRM, ERP, manufacturing-operations, and workload-management platform. VMOS is the Vitality Modification Company deployment and proving-ground configuration; it is not the product boundary.

## Decision

The product is separated into these layers:

- **Platform Core:** tenant/brand configuration, identities, users/roles, documents, audit/event conventions, notification orchestration, repositories, and storage contracts.
- **Manufacturing Core:** Company, Contact/Customer, RFQ, Quote/Quote Revision, Job/Work Order, Part, Invoice, Receipt, Purchase, Workflow, Operation, Machine, Tool, Fixture, Material, and Job Event.
- **Specialty modules:** Firearms and Coatings own their unique data and UI. They attach extension records to canonical core IDs; they do not add specialty fields to generic Jobs, Customers, or Parts.
- **Integrations:** optional adapters behind contracts. The Atlas Workflow Engine is upstream of an Asana adapter, a future native Kanban, and any other board adapter. Gmail, Drive, AI, notification, and storage providers follow the same rule.
- **Tenant/Brand configuration:** organization name, deployment/product display name, logo references, primary/secondary/accent colors, light/dark assets, optional typography, enabled modules, and terminology overrides. VMOS/Vitality is the current default configuration, not a platform constant.

`UI module -> application service -> repository -> storage adapter` remains mandatory. Google Sheets is VMOS's current storage adapter, not a business-logic dependency. Future PostgreSQL/multi-tenancy must implement the same contracts; this ADR does not authorize a database migration, tenancy infrastructure, billing, subscriptions, or licensing.

## Consequences

Firearms UI consumes Firearms module records plus Manufacturing Core services. Coatings terminology such as Cerakote is configured in the Coatings module, not required by core workflow. Each tenant currently has a separate deployment/configuration boundary; future tenant isolation must be introduced at repository/configuration boundaries, not retrofitted into UI logic.

## Existing deviations to address deliberately

`MvpService`/`getVmosConfig_` use deployment-specific names for currently generic services; shared `WorkflowConfig.gs` includes a `CERAKOTE` default; `QuoteTemplate.html` has a Vitality brand string; and several operational configuration/repository constructors directly choose the Sheets adapter. These are contained technical-debt seams, not a change to live behavior. They need an incremental Platform Core extraction before Atlas is offered beyond VMOS.
