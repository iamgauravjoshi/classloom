# ClassLoom product design system

Date: 2026-10-06. Sources: root `AGENTS.md`, root `DESIGN.md`, `apps/web/DESIGN.md`, and the ClassLoom skill. This specification makes those principles concrete for the implemented product.

## Product and hierarchy

School staff need to find records, act on exceptions, and complete school workflows accurately. Identity and school context precede academic context; the page title and one primary action precede filters and records. Detail screens lead with the person's identity or case reference, then current state, then related records and history. Editing and consequential actions stay distinct from read-only information. Existing API permissions and workflow rules remain authoritative.

Use Inter throughout. The signature is precise academic structure, legible tables, royal blue actions, and calm slate surfaces. Remove decorative sample charts, artificial metrics, inert controls, excessive card nesting, and competing page-specific visual treatments.

## Foundation

| System | Decision |
| --- | --- |
| Spacing | 4px rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Mobile page padding 16px; desktop 32px. Section gap 32px; field gap 20px. |
| Type | Metadata 12/18; controls and records 14/20; prose 16/24; section titles 18/28; page titles 24/32; key values 32/40. Body 400, labels 500, titles 600. Text inputs use 16px on phones to avoid browser zoom. Comparable values use tabular numerals. |
| Color | Page slate `#f4f6fa`, surface white, primary text navy `#17243d`, secondary `#43536b`, muted `#59677e`, brand `#3559d8`. Semantic success, warning, danger, and info each pair readable text with a restrained background. Both themes define the same semantic tokens. |
| Tokens | `background/card/popover/foreground`, `text-secondary/muted-foreground`, `border/input/ring`, `primary/primary-hover/brand-soft`, `success/warning/destructive/info` and their soft surfaces, `sidebar-*`, plus spacing, type, radius, and shadow variables. Components consume tokens; features do not invent palettes. |
| Radius | Controls 8px, surfaces 12px, modal 16px. Status badges 6px. No decorative pill containers. |
| Elevation | Borders define surfaces. Small shadow for floating controls; one overlay shadow for dialogs and sheets. No repeated large shadows on routine content. |
| Interaction | Hover changes surface or brand tone; pressed remains stable; focus uses a clearly visible blue ring with offset. Disabled controls remain legible. Busy actions disable repeat submissions and name the work in progress. |
| Motion | 120–180ms opacity and transform feedback. Reduced-motion disables animation and scrolling transitions. No continuous decoration. |

## Responsive and accessibility contract

Desktop navigation is a 248px sidebar; the header is 64px. Below 1024px navigation becomes a titled Base UI sheet with keyboard focus management. Content uses all useful space for data, with a restrained maximum width for reading and forms. Below 640px headers/actions wrap, forms use one column, touch targets are at least 44px, and editable rosters become record cards. Date pickers use a modal Base UI popover with an explicit close action, viewport positioning, collision shifting, and compact calendar padding. While a phone calendar is open, its scroll lock releases the reserved desktop scrollbar gutter and uses the full viewport; seven 44px day columns fit even a 320px viewport. Comparison tables retain deliberate, keyboard-focusable horizontal scrolling with a descriptive label. Never clip actions or hide essential values merely to fit.

Use semantic headings (one h1 per page), named navigation, real links for navigation, persistent field labels, associated descriptions/errors, visible focus, and a skip link. Meaningful status always includes text. Minimum contrast is WCAG AA: 4.5:1 for normal text, 3:1 for large text and meaningful control indicators. Tables name their scroll regions. Error states offer recovery; successful writes cannot be represented as failed saves. Do not replace explicit attendance decisions or financial/examination review rules with visual defaults.

## Reusable patterns

- `PageHeader`: contextual breadcrumb, title, short description, and actions. Responsive action row.
- `PageStack`: consistent vertical rhythm; `Toolbar`: labeled context/filter controls, optional actions and clear filters.
- `SectionHeader`: real heading and description, optional secondary action; fewer nested surfaces.
- `FieldGrid`: a FieldGroup for paired controls; `FormActions`: consistent final action placement; `ChoiceField` and `DateField`: shared labeled selectors and calendar controls.
- `StatusBadge`: semantic label/tone shared by all workflow states.
- `DetailList`: semantic dt/dd display for identity, contact, placement, and financial facts.
- Installed Base UI Button, Field, Input, Select, Calendar, Dialog, Sheet, Tabs, Table, Empty, Alert, Skeleton, and Toast own their interaction states.
- Lists use a single records surface, filters, explicit no-results state and cursor pagination. Profiles separate shared identity, school relationships, and account access. Long setup workflows use section navigation/progressive disclosure.
- Authentication uses one focused form and a restrained branded context panel. Workspace selection uses real membership options, without claiming unavailable school names.
- Overview presents available workflows and real context; it never claims sample data as live school metrics.

## State matrix

Every data feature covers loading, loaded, empty, filtered-empty, unavailable permission, request error with retry, disabled prerequisites, pending mutation, success, and unsaved/stale edits where supported. Forms retain values on validation or request failure. Destructive decisions name their object and explain the effect. Dialogs have titles/descriptions, scroll within the viewport, and preserve close-animation content. Notifications supplement persistent field/page feedback.

## Screen inventory and delivery order

1. Tokens and shared controls: buttons, inputs, selects, checkboxes, dates, tables, badges, tabs, dialogs, sheets, toast, skeleton, and state primitives.
2. Layouts: authenticated shell, responsive navigation, account/theme actions, auth frame, page headers, route loading/error/not-found.
3. Overview and identity: dashboard, login, invitation acceptance (new/existing account), password reset request/reset, workspace selection.
4. People: staff list/detail/editor, student list/profile/new admission, guardian list/profile, identity/account/relationship forms.
5. Enrollment/import: school admission, placement, transfer/withdrawal/completion, CSV selection, mapping, preview, and commit feedback.
6. Academics and operations: academic setup and activation, timetable grid/day view and editor, attendance roster and audited save.
7. Admissions: worklist, new enquiry, case details/editor, review/decision/conversion, history.
8. Finance: context, heads/plans/issuance task tabs, statements/outstanding, concessions, payment forms, receipts, and reversal forms.
9. Examinations: exam and assessment configuration, roster marks, submission/review/locking, corrections and history.

## Verification

Run the existing web workflow tests, lint, typecheck, and production build. Add tests for changed navigation, permissions visibility, focus/recovery, and shared semantics where useful. Review authenticated real records at desktop, intermediate, and phone widths, plus authentication, empty/error states, dark theme, keyboard focus, and long content. Track coverage and concrete limitations in a final UI verification record. Safari/Firefox are only reported verified if those engines were actually run.
