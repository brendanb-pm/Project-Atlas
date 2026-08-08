# Firearms Tablet UX

The Firearms workspace is a dedicated, touch-first operating surface for 10–13 inch tablets. It uses charcoal/black, light reading surfaces, high-contrast Vitality red actions, roughly 44px minimum targets, landscape-first responsive layouts, and a stacked portrait layout. Normal ERP navigation is hidden until the user explicitly exits Firearms mode.

Primary navigation is only **New Intake**, **Active Work**, **Lookup**, and **Scan QR**. Operators never type or review CustomerID, JobID, DocumentID, board task IDs, workflow IDs, paths, or JSON.

## New Intake

The guided sections retain the source form's information architecture without copying paper layout: Shop Use Only; Customer Information; Item Information; Requested Work; Optic / Parts Status; Condition / Inspection Notes; Photos; Customer Notes; Authorization; Review. Required creation checks are customer name, item type, one requested service, and explicit authorization. The review presents the created Work Order number, status `RECEIVED`, what happens next, and any photos/documents.

### Digital intake contract

- Shop: Work Order #, received date/by, estimate, payment status, final QC.
- Customer: name, phone, email, preferred contact, intake/return method, return address or notes.
- Item: type (Slide, Barrel, Frame/Grip, Complete Pistol, Other), manufacturer, model, caliber, serial/identifying marks, OEM/aftermarket, finish, modification history, and reference.
- Requested work: selected services (optic cut, finish, milling, serrations/windows, barrel work/porting, stippling, sights, optic install, engraving, disassembly/reassembly, threading/fit, other), specifics, footprint, colors, instructions.
- Optic/parts: source, make/model, hardware source, sights, parts, photo references.
- Condition: listed observations plus notes. Authorization includes added-work contact choice, signature, printed name, and date.

## Camera-first photos

Offer obvious capture tiles for overall, left/right/top/bottom, existing damage, optic, hardware, included parts, and identifying marks where appropriate. The UI sends a capture request to the VMOS document-storage abstraction; it never calls Drive. The returned Document reference is associated with Work Order, Item, inspection/condition, and optic/supplied-part contexts. Originals are retained with no hard deletion.

## Acceptance checklist

- Landscape completes intake without horizontal scrolling; key actions remain visible and touch targets are ~44px or larger.
- Portrait stacks sections without clipping critical controls.
- No raw IDs or JSON are exposed; photo capture and review summary are obvious; touch authorization is usable.
- An unfamiliar operator can create intake, find active work, report a problem, and understand current status without learning VMOS architecture.
