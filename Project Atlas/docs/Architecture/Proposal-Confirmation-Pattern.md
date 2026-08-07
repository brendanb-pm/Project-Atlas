# Proposal / Human Confirmation Pattern

All untrusted inputs—Gmail, future voice transcripts, uploaded documents, and manual AI helpers—produce a staged Proposal. A provider may extract fields, but may never create Company, Customer, Part, RFQ, Quote, Job, or other production records directly.

`source -> staged document metadata -> AI/provider proposal -> validation + entity-match presentation -> human correction/confirmation -> idempotent domain command -> immutable audit event`

Proposals retain the original source reference, provider output, matching result, corrections, and approval/rejection events. A retry may repeat extraction but cannot create a second committed record for an approved staging ID. Voice uses the same contract: transcript, proposed action, explicit confirmation, then an append-only production event.

RFQ Intake is disabled unless `VMOS_RFQ_INTAKE_ENABLED` is exactly `true`.
