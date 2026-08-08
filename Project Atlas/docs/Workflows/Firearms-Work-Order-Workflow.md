# Firearms Work-Order Workflow

Canonical base states: `RECEIVED`, `INSPECTION`, `QUEUED`, `IN_PROCESS`, `COATING`, `REASSEMBLY`, `FINAL_QC`, `READY_FOR_PICKUP`, `COMPLETE`; exceptions: `BLOCKED`, `WAITING_CUSTOMER`, `WAITING_PARTS`.

Paths are configured, not assumed linear. An optic-cut-only order can take `INSPECTION -> IN_PROCESS -> FINAL_QC`; Cerakote can take `IN_PROCESS -> COATING -> REASSEMBLY -> FINAL_QC`; an intake may skip states that do not apply. VMOS validates each configured edge before it changes status, and every accepted edge appends a JobEvent.

New Intake creates the canonical Work Order through VMOS identity generation, required Firearms records, `RECEIVED`, a received JobEvent, and an **Asana-card creation request**. It does not create a card in this sprint. Problems remain handled by the existing QR/shop-floor STOP/PROBLEM controls and event history.
