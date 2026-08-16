# MOS-128D Firearms contextual interaction

Routine Firearms actions use structured dialogs and bounded tenant-scoped Customer, External FFL, and eligible Job / Work Order search. Typed text is never a canonical relationship until an operator selects a returned result. The server revalidates every selected ID and derives relationship display names authoritatively.

The workspace hydrates only the selected firearm's relationships. Missing, inactive, inaccessible, or foreign references retain their stored identity and render as unavailable without exposing foreign data. Search returns at most 25 contextual results and no relationship directory is loaded into the browser.

Corrections use a server-owned mapping from human-readable field keys to the existing MOS-124 correctable fields. Custody and disposition use structured consequence summaries. Disposition requires explicit final confirmation. All changes retain version checks, immutable AuditContext, append-only regulatory events, pending-event recovery, and distinct original/recovery actors.

Uncertain consequential outcomes trigger authoritative refresh and do not present blind retry guidance. Legal and ATF operational acceptance remains a separate gate. No persistence schema, production data, configuration, or deployment is changed by MOS-128D.
