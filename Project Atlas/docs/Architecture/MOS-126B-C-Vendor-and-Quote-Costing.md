# MOS-126B+C — Vendor Foundation and Quote Internal Costing

**Release channel:** MAIN  
**Baseline:** `13ede8474733a17248a8178f4bf57c2d8ec55e1a`

Atlas now defines one tenant-scoped Vendor organization with many capabilities, locations, contacts, and estimate references. Vendor estimates remain planning references: they do not represent purchase orders, receipts, AP invoices, inventory, or payment. The additive stores are `Vendors`, `VendorCapabilities`, `VendorLocations`, `VendorContacts`, `VendorEstimates`, `QuoteCostEstimates`, `QuoteCostLines`, `QuotePricingDecisions`, and `QuoteSourceDocumentLinks`; no initializer or production migration is included.

Internal Quote cost uses exact integer minor-unit strings and decimal operands limited to four places. Explicit bases are `BATCH_TOTAL`, `PER_PART`, `HOURLY_PER_PART`, `ONE_TIME`, and `QUANTITY_BASED`. Source batch totals remain authoritative; rounded allocations are display-only. `SUPPLIER_SUMMARY` lines are forced out of rollup and reconcile against their detail group. Internal recurring and one-time/NRE cost remain separate from customer recurring and one-time price.

Customer output is an explicit allow-listed projection and cannot serialize Vendor, source-cost, markup, margin, internal-note, or private-document data. `QUOTE_COST_READ`, `QUOTE_COST_WRITE`, `QUOTE_PRICING_MANAGE`, and `QUOTE_MARGIN_READ` are separate capabilities. Only the existing Manager and Admin defaults receive all four; ordinary Sales does not gain margin access. Supplier costing never grants purchase approval.

All writes are tenant- and server-actor scoped and use the MOS-121 security-operation boundary. Reads are bounded to 50 by default and 200 maximum. Initial Sheets adapters may still scan their backing store internally; real Apps Script/Sheets measurements remain required before activation or index/helper-sheet decisions.

VMC-0128 is represented without production data: quantity 18, supplier detail and non-rollup summary `$2,350.25`, display allocation `$130.57`, recurring estimated cost `$11,800.25`, customer recurring price `$12,505.32`, and contribution `$705.07`. The rollup never reconstructs `$2,350.25` from the rounded allocation and never double-counts the summary.
