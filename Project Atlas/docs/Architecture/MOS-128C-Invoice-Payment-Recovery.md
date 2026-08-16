# MOS-128C Invoice payment recovery

An Invoice payment attempt receives one browser-session `PAY-*` command identity before its first submission. Atlas retains the immutable payment fields with that identity through submission, uncertain transport outcomes, authoritative reconciliation, and safe retries. Operators never enter or copy the identity.

`recordInvoicePayment` binds the trusted tenant and actor, authoritative Invoice and Customer, amount, method, date, reference, and command identity into the security operation fingerprint. Reusing the command with different payment details conflicts. The Cash Receipt remains idempotent by command identity.

`reconcileInvoicePaymentAttempt` is a finance-authorized bounded lookup by command identity. It validates the trusted Invoice context, tenant, actor, and immutable payment fields and returns only `CONFIRMED` with operator-safe receipt details or `NOT_COMPLETED`. Lookup failure remains uncertain and never authorizes a new command.

The UI lifecycle is `READY → SUBMITTING → CONFIRMED`, with `UNCERTAIN → reconciliation → CONFIRMED | FAILED_SAFE_TO_RETRY`. A new attempt is available only after confirmation or authoritative non-completion. Invoice balances are not recalculated by this workflow.

No production schema, data, configuration, or deployment change is part of MOS-128C.
