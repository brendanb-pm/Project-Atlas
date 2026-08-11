# MOS-122B Atlas Design System and Shared UI Foundation

Release channel: **MAIN**
Baseline: `008aaede145e59ade31b7994c289d8aa973c559f`

## Purpose and boundary

This document is the governing visual and interaction reference for MOS-122C-G. Atlas uses a lightweight HTML/CSS/JavaScript foundation compatible with Apps Script templates. It adds no framework, remote font, icon library, storage dependency, business read, or production configuration. Screens remain clients of canonical Atlas services.

The design intent is operational, professional, calm, compact, trustworthy, and readable for a full working day. Decoration, oversized metrics, excessive whitespace, hidden operational information, consumer-app effects, and generic admin-template styling are deliberately avoided.

## Current UI audit

The routed surfaces were Command Center/Index, Customers and the MVP entity shell, Sales Activity, Follow-Up Calendar, Shop Floor, Operations Dashboard, Ideas, and Traveler. RFQ Intake Review, Quote Preparation, and Quote Template were inspected as reference/output templates but remain outside the production route registry.

Before MOS-122B, every routed surface independently declared some combination of:

- Arial typography, canvas/surface colors, spacing, radii, and shadows;
- primary/secondary/destructive buttons and disabled states;
- cards, panels, metrics, forms, tables, badges, notices, loading indicators, and focus rings;
- breakpoints ranging from 420 to 1050 pixels;
- transient message functions with different placement and semantics.

The duplication produced inconsistent accent colors, density, title sizing, status treatment, touch targets, responsive behavior, and notification semantics. Command Center metrics were visually large relative to their information content. Index tables intentionally scrolled but did not expose the scroll region to keyboard users. Page-specific async helpers remain duplicated and are staged debt because changing their mutation/recovery behavior belongs with the owning workflow stories.

## Foundation architecture

`UI/AtlasDesignSystem.html` is the single shared token, primitive-component, responsive, accessibility, and UI-helper source. Routed templates include it after legacy page CSS. This ordering makes shared semantics authoritative while allowing explicitly more-specific workflow styles such as large shop-floor controls and print travelers.

The layer provides:

- design tokens and backward-compatible aliases for existing page variables;
- layout, page header, action, surface, and panel primitives;
- buttons, forms, status labels, feedback, loading/empty/error states;
- tables, identifiers, metrics, notifications, and dialog contracts;
- `AtlasUi` helpers for busy controls, live notifications, clearing feedback, and associated field errors;
- central responsive, large-display, reduced-motion, and print behavior.

`NavigationFrame.html` consumes the same tokens and now keeps the current workspace visible outside the menu. The Index retains its persistent desktop sidebar but consumes the same foundation.

## Design tokens

### Typography

`--atlas-font` uses a local system sans-serif stack and introduces no network dependency. `--atlas-mono` is reserved for stable identifiers. Body text is 15 pixels with a 1.45 line height; page titles scale from 24 to approximately 30 pixels. Section titles, labels, metadata, metrics, table text, and identifiers have defined roles. Operational identifiers use tabular monospace figures without forced uppercase.

### Spacing and layout

The base scale is 4, 8, 12, 16, 20, 24, and 32 pixels. Shared content is bounded at 1200 pixels, with a separate 820-pixel reading measure. Page gutters collapse centrally at tablet and mobile breakpoints. Panels use 16-pixel padding and 12-16-pixel operational gaps. Metrics use compact padding and do not impose decorative minimum height.

### Borders, radii, and elevation

Borders establish most hierarchy. Radii are restrained at 4, 6, and 9 pixels. Ordinary surfaces use a subtle two-pixel elevation; overlays alone use the stronger shadow. This avoids a field of floating rounded cards.

### Semantic color and status

Tokens separate canvas, surfaces, text levels, borders, interaction, focus, success, warning, danger, information, disabled, and selected state. Status primitives pair text, border/background, and a visible marker so color is never the sole cue. Supported semantics include active/success, pending/warning, blocked/danger, information, and disabled. Domain labels such as complete, approved, cancelled, draft, and failed map to these semantic states rather than defining new literal colors.

### Tenant branding boundary

`DeploymentProfile` continues to own product and organization labels. Neutral Atlas is the fallback. The tenant may supply presentation identity and, in a future controlled extension, an accent; system focus, status, danger, disabled, and contrast semantics remain Atlas-owned. The shared foundation contains no VMOS or Vitality default and no tenant may override safety semantics merely for branding.

## Component and interaction contracts

### Page frame

A routed page provides navigation, tenant/application identity, visible current location, a page title, concise purpose, one primary action where appropriate, subordinate actions, an accessible status region, and page content. Context or breadcrumbs may be added where hierarchy warrants them. Large-display pages may opt into `body.atlas-display`, which increases viewing-distance readability and removes interactive navigation chrome.

### Actions

Four shared levels exist: primary, secondary, quiet/tertiary, and danger. One action should normally be primary within a context. Controls have a 44-pixel minimum target, visible focus, clear disabled and `aria-busy` behavior, and business-verb labels. Sales Activity now demonstrates `Log Activity` as primary and `Open Follow-Up Queue` as subordinate. Shop Floor retains intentionally larger targets.

### Forms

Visible labels are mandatory; placeholders are examples, not labels. Required state, helper text, adjacent errors, read-only/disabled appearance, field grouping, and action placement have shared primitives. `AtlasUi.fieldError` connects errors through `aria-invalid` and `aria-describedby`. Existing workflow code must continue preserving entered data on recoverable failure and must not expose storage IDs where a human selector exists.

### Tables, lists, cards, and metrics

Tables remain the default for dense comparison, lists for chronology or task queues, and panels for summaries or groups. Shared tables use compact readable rows, strong headers, focus/hover support, identifier styling, and a bounded scroll-region strategy on narrow screens. Index table regions are now keyboard focusable and labeled. Operations Dashboard retains its existing stacked mobile row treatment. Future MOS-120 pagination and bounded queries can replace data sources without changing these presentation contracts.

Metrics contain value, label, optional context, and optional action. They use tabular figures and compact auto-fitting grids. MOS-122B changes presentation only and invents no metrics or trends.

### Feedback, notifications, and dialogs

Loading, saving, success, validation, provider/system error, uncertain outcome, empty, no-permission, and transport failure are distinct semantic states. Uncertain outcomes must request authoritative refresh rather than claim success or encourage blind retry. MOS-121 safe client errors remain authoritative.

Inline feedback belongs near the affected work. Transient confirmations use a toast, durable workflow/provider conditions use a banner, and dialogs are reserved for consequential interruption. Live feedback uses `status`; errors use `alert`. Dialog text must name the action, record, consequence, and reversibility rather than ask only “Are you sure?”. Routine success must not use a modal.

## Accessibility and responsive rules

The shared layer requires semantic headings, visible labels, keyboard operation, three-pixel visible focus, live-region semantics, text-plus-color status, 44-pixel targets, reflow, long-value wrapping, associated form errors, and reduced dependence on hover. Motion collapses under `prefers-reduced-motion`. This is WCAG-aligned engineering guidance, not a certification claim.

Default CSS covers 1440x900 desktop. Central breakpoints cover 1024x768 tablet landscape, 768x1024 tablet portrait, and the 390x844 mobile class through a 480-pixel rule. Headers/actions stack deliberately, table scroll regions remain operable, notification regions fit the viewport, and metrics collapse to two columns on narrow phones. A 1600-pixel-plus large-display mode provides a foundation for MOS-122E without building the Floor Board.

## Migration status

Migrated to the shared foundation:

- Command Center and MVP entity shell;
- MOS-122A navigation frame;
- Sales Activity;
- Follow-Up Calendar;
- Shop Floor;
- Operations Dashboard;
- Ideas;
- Traveler.

Page-specific workflow styling remains intentionally layered above or alongside shared primitives. Static RFQ/Quote references and the printable quote template were not converted into a parallel routed architecture.

Remaining legacy presentation debt:

- repeated local CSS remains until each owning MOS-122C-G workflow is migrated in depth;
- page-specific message/API wrappers remain duplicated;
- several generated forms still expose canonical IDs because selector/read-model work is not part of MOS-122B;
- Index remains bootstrap-backed and Command Center workflow/content belongs to MOS-122C;
- static RFQ/Quote templates need a later decision about productionization;
- no shared dialog is currently used by a routed workflow;
- real assistive-technology and rendered viewport inspection remain outstanding.

## Performance and validation

The foundation is local text included once per page. It adds no server call, repository access, remote asset, framework runtime, polling, animation library, or business-data bootstrap. Navigation continues loading independently through the MOS-122A request. The shared helper performs work only when called; initialization does not block business content. CSS adds one style block and a small frozen helper object. Real Apps Script/browser payload, parse, paint, and representative-data timing were not measured, so performance QA remains partial.

Code-level visual heuristics show improved consistency, denser metrics, clearer current location and action hierarchy, shared focus/feedback semantics, and tenant-neutral presentation. Rendered visual QA was not performed and remains a MOS-122H evidence gate.

## Guidance for MOS-122C-G

New UI must consume these tokens and primitives before adding page-specific CSS. Add a new primitive only when at least two workflows need it or the behavior is foundational. Preserve domain-specific density for shop-floor, CRM, administration, and large-display contexts. Do not fork token sets per module, make branding control safety colors, introduce unbounded payloads for visual convenience, or duplicate async/error semantics. Workflow stories should incrementally remove the legacy declarations they supersede.
