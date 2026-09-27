# DESIGN.md

## ClassLoom Design Direction

ClassLoom should provide a clean, modern, information-dense School Management SaaS interface.

The primary UI reference is:

**PreSkool School Management UI**  
https://preskool.dreamstechnologies.com/html/

Use PreSkool as the main reference for:

- overall visual language;
- application shell;
- sidebar navigation;
- header layout;
- dashboards;
- cards and widgets;
- tables and lists;
- forms;
- filters;
- modals/drawers;
- profile/detail pages;
- badges and statuses;
- spacing and visual hierarchy.

The objective is to achieve a **very close visual experience** while implementing components using ClassLoom's own architecture and design system.

---

## Application Shell

Desktop pages should generally follow:

```text
┌───────────────────────────────────────────────┐
│ Sidebar │              Header                │
│         ├─────────────────────────────────────┤
│         │                                     │
│         │            Page Content             │
│         │                                     │
└───────────────────────────────────────────────┘
```

### Sidebar

Use a persistent left sidebar similar to PreSkool.

Navigation should:

- group features by domain;
- support nested menu items;
- clearly indicate the active page;
- support collapse/expand behavior;
- show only features available to the current user.

Typical groups include:

- Dashboard
- Students
- Teachers & Staff
- Academics
- Attendance
- Examinations
- Fees & Finance
- Communication
- Library
- Transport
- Reports
- Administration
- Settings

Navigation visibility improves UX but is not an authorization boundary.

### Header

The application header should provide relevant global controls such as:

- sidebar toggle;
- academic year/context selector;
- search when applicable;
- quick actions;
- notifications;
- profile/account menu.

Keep the header compact and avoid unnecessary visual noise.

---

## Page Structure

Use a consistent hierarchy:

```text
Page title / Breadcrumbs
↓
Page-level actions
↓
Filters / Search when needed
↓
Primary content
↓
Pagination / Secondary information
```

Pages should feel predictable across modules.

Do not create entirely different layout patterns for similar CRUD workflows.

---

## Visual Style

Follow the general PreSkool aesthetic:

- light application background;
- white content surfaces;
- subtle borders;
- restrained shadows;
- moderate border radius;
- clear typography hierarchy;
- compact but readable spacing;
- colored accents for important states;
- icons paired with labels where useful.

Prefer a professional SaaS/admin appearance rather than decorative UI.

Avoid:

- excessive gradients;
- oversized shadows;
- unnecessary animations;
- excessive rounded cards;
- excessive use of bright colors;
- inconsistent spacing.

---

## Design Tokens

Do not scatter arbitrary visual values throughout components.

Define reusable tokens for:

- colors;
- typography;
- spacing;
- radius;
- shadows;
- borders;
- breakpoints;
- component states.

Prefer semantic tokens such as:

```text
background
surface
border
text
text-muted

primary
success
warning
danger
info
```

Components should consume design tokens rather than hard-coded visual values whenever practical.

---

## Core Components

Create reusable primitives for recurring ClassLoom UI.

Examples:

```text
Button
Input
Select
Checkbox
Radio
Textarea
DatePicker

Badge
Avatar
Tooltip

Card
StatCard

Table
DataTable
Pagination

Tabs
Dropdown
Popover

Dialog
Drawer

Breadcrumb
PageHeader

EmptyState
ErrorState
Skeleton
```

Feature pages should compose these primitives instead of repeatedly implementing new versions.

---

## Dashboards

Dashboards should follow PreSkool's card/widget-oriented structure.

Typical sections may include:

- summary/stat cards;
- attendance;
- student/staff counts;
- fees and collections;
- upcoming events;
- schedules;
- academic information;
- charts;
- recent activity;
- quick actions.

Dashboard content should depend on the authenticated user's role and permissions.

Prioritize useful information over maximizing the number of widgets.

---

## Tables

Tables are a primary interaction pattern in ClassLoom.

Standard data pages should support applicable combinations of:

- search;
- filters;
- sorting;
- pagination;
- row actions;
- status badges;
- bulk actions;
- export;
- column configuration where justified.

Keep row actions consistent across modules.

Avoid loading unbounded datasets into the browser.

---

## Forms

Forms should have consistent:

- labels;
- field spacing;
- required indicators;
- validation messages;
- section grouping;
- button placement;
- loading states.

Large forms should be divided into logical sections or steps.

Prefer clear labels above clever compact layouts.

Always distinguish:

- optional fields;
- required fields;
- read-only values;
- disabled values;
- validation errors.

---

## Status and Feedback

Use consistent semantic feedback:

- green — success/active/completed;
- amber — warning/pending;
- red — error/danger/inactive where appropriate;
- blue/primary — informational or primary actions.

Do not rely on color alone.

Use labels or icons alongside color for meaningful states.

Provide clear feedback for:

- loading;
- success;
- validation errors;
- API failures;
- empty data;
- unavailable/unauthorized actions.

---

## Responsive Design

ClassLoom must remain usable on smaller screens.

Desktop should remain the primary experience for data-heavy administration workflows.

On smaller screens:

- collapse the sidebar;
- reduce non-essential controls;
- stack layout sections;
- make dialogs/drawers appropriately sized;
- allow tables to scroll or use intentional mobile representations;
- preserve primary actions.

Do not simply shrink the desktop UI.

---

## Accessibility

All ClassLoom UI should:

- use semantic HTML;
- support keyboard navigation;
- provide visible focus states;
- associate labels with inputs;
- provide accessible names for icon-only actions;
- maintain adequate contrast;
- avoid communicating meaning through color alone.

Accessibility should be preserved even when reproducing PreSkool-style visuals.

---

## Implementation Rule

When implementing a page that exists in the PreSkool reference:

1. inspect the corresponding PreSkool page;
2. reproduce its overall layout and visual hierarchy closely;
3. reuse existing ClassLoom components;
4. extract reusable patterns instead of duplicating markup;
5. adapt labels/data/actions to ClassLoom product requirements;
6. maintain accessibility and responsive behavior;
7. follow `apps/web/AGENTS.md`.

PreSkool is the **visual reference**.

ClassLoom product documentation and architecture remain the source of truth for:

- feature behavior;
- permissions;
- business rules;
- workflows;
- data;
- security.

Do not implement a PreSkool feature solely because it exists in the reference unless it belongs to ClassLoom's planned product scope.

---

## Design Principle

> **Match the PreSkool experience visually; build it the ClassLoom way technically.**

The final UI should feel consistent enough that screens appear to belong to one unified product rather than independently designed feature modules.
