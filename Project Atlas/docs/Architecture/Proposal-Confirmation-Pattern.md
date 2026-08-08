# Proposal / Human Confirmation Pattern

All untrusted inputs—Gmail, future voice transcripts, uploaded documents, and manual AI helpers—produce a staged Proposal. A provider may extract fields, but may never create Company, Customer, Part, RFQ, Quote, Job, or other production records directly.

`source -> staged document metadata -> AI/provider proposal -> validation + entity-match presentation -> human correction/confirmation -> idempotent domain command -> immutable audit event`

Proposals retain the original source reference, provider output, matching result, corrections, and approval/rejection events. A retry may repeat extraction (maximum three attempts, then `NEEDS_ATTENTION`) but cannot create a second approved plan for a staging ID. Voice uses the same contract: immutable transcript, proposed action, explicit confirmation, then an append-only production event.

RFQ Intake is disabled unless `VMOS_RFQ_INTAKE_ENABLED` is exactly `true`.

## Tablet review specification

The reviewer sees Company and Contact match cards, each marked Existing/New/Uncertain/Missing; parts with exact part number, revision, description, material, process, quantities, and supplier; customer-supplied components; document cards and document-to-part associations; delivery request; warnings; and confidence cues. The reviewer never sees JSON, database IDs, Gmail labels, Drive paths, or AI prompts. Approval produces an explicit entity/action plan only; no production record is created in this phase.
