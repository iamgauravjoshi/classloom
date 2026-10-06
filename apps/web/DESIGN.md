# DESIGN.md — Classloom

> Design standard for **Classloom**, a School Management SaaS for administrators, teachers, students, and parents.

Implementation reference: [product design system](../../docs/development/design-system.md). Its semantic tokens and reusable patterns implement the principles in this guide.

## 1. Product Direction

Classloom should feel:

- modern;
- calm;
- trustworthy;
- organized;
- friendly but professional;
- simple enough for non-technical school staff.

Avoid:

- childish education visuals;
- excessive gradients;
- glassmorphism everywhere;
- overly rounded UI;
- decorative dashboards;
- generic “AI SaaS” styling.

The product should feel like a **modern operating system for schools**.

---

## 2. Core Principles

### Clarity First

Every screen should make these obvious:

1. Where am I?
2. What matters now?
3. What can I do?
4. What changed?
5. What happens next?

Primary actions should use clear verbs:

- Add student
- Mark attendance
- Record payment
- Publish result
- Create notice

### Role-Aware UX

Classloom serves different users.

**Admin**

- dashboard;
- students;
- teachers;
- attendance;
- admissions;
- fees;
- exams;
- reports;
- settings.

**Teacher**

- today's classes;
- attendance;
- marks;
- assignments;
- timetable;
- student details;
- notices.

**Student**

- timetable;
- assignments;
- attendance;
- results;
- notices;
- fee status.

**Parent**

- child overview;
- attendance;
- fees;
- results;
- assignments;
- notices.

Do not expose actions users cannot perform.

---

## 3. Visual Language

Default visual system:

```txt
Light neutral background
+ white surfaces
+ strong indigo/blue brand accent
+ subtle borders
+ minimal shadow
+ medium radius
+ strong typography
+ clear data presentation
```

Use color for meaning, not decoration.

### Suggested Tokens

```txt
--bg-page
--bg-surface
--bg-muted

--text-primary
--text-secondary
--text-muted

--border-subtle
--border-strong

--brand
--brand-hover
--brand-soft

--success
--warning
--danger
--info
```

Recommended semantic direction:

```txt
Brand       Indigo / Royal Blue
Success     Green
Warning     Amber
Danger      Red
Info        Blue
```

Most of the interface should remain neutral.

---

## 4. Typography

Use one modern sans-serif:

- Inter
- Geist
- Manrope
- IBM Plex Sans

Recommended scale:

```txt
12px   metadata
14px   compact UI
16px   body
18px   section label
20px   card title
24px   page title
32px   dashboard highlight
```

Weights:

```txt
400   body
500   labels
600   titles
```

Use tabular numerals for:

- fees;
- marks;
- percentages;
- IDs;
- financial data.

---

## 5. Spacing & Radius

Use a 4px spacing system:

```txt
4  8  12  16  20  24  32  40  48  64
```

Defaults:

```txt
Desktop page padding     24–32px
Mobile page padding      16px
Card padding             16–24px
Grid gap                 16–24px
Section gap              32–48px
```

Radius:

```txt
Inputs      8px
Buttons     8–10px
Cards       12px
Large panel 16px
```

Prefer borders over large shadows.

---

## 6. App Shell

Desktop:

```txt
Sidebar     240–260px
Top bar     60–68px
Content     24–32px padding
```

Recommended navigation:

```txt
Overview

Academics
- Students
- Teachers
- Classes
- Attendance
- Timetable
- Assignments
- Exams

Finance
- Fees
- Payments

Communication
- Notices
- Messages

Administration
- Admissions
- Reports
- Settings
```

Keep the hierarchy shallow.

---

## 7. Page Structure

Most operational pages should follow:

```txt
Page title
Optional description

Filters / search
Primary action

Main content
```

Example:

```txt
Students
Manage enrolled students and academic records.

[Search] [Class ▼] [Status ▼]      [+ Add student]
```

Do not use oversized headings in application screens.

---

## 8. Dashboard

Admin dashboard priority:

1. attendance;
2. fee collection;
3. student/staff totals;
4. operational alerts;
5. upcoming events;
6. notices.

Recommended structure:

```txt
Page header

3–5 KPI cards

Attendance trend
Fee collection summary

Upcoming events
Recent notices
Students requiring attention
```

A KPI should include context.

Good:

```txt
Student attendance
92.4%
+1.8% vs last week
```

Avoid rows of 8–12 tiny metric cards.

---

## 9. Tables

Tables are a core Classloom pattern.

Use them for:

- students;
- teachers;
- fees;
- attendance;
- marks;
- admissions;
- reports.

Rules:

- text left-aligned;
- numbers right-aligned;
- sticky headers for long lists;
- restrained row separators;
- row hover;
- search/filter support;
- pagination or virtualization;
- clear empty state.

Row actions:

```txt
View
Edit
More
```

Do not show many buttons in every row.

### Student Table

Recommended columns:

```txt
Student
Admission No.
Class
Section
Guardian
Attendance
Fee Status
Status
Actions
```

---

## 10. Attendance

Attendance should be one of the fastest workflows in Classloom.

Teacher screen:

```txt
Class
Date
Period

Student list

Present
Absent
Late
Leave
```

Recommended behavior:

- default students to Present;
- teacher changes exceptions;
- support keyboard navigation;
- show live counts;
- use large touch targets;
- make Save clear.

Example:

```txt
Present 32
Absent 2
Late 1

[Save attendance]
```

---

## 11. Fees & Payments

Financial screens must feel precise and trustworthy.

Always show:

```txt
Amount
Due date
Paid amount
Remaining amount
Status
Payment date
Receipt
```

Statuses:

```txt
Paid
Partially paid
Pending
Overdue
Waived
```

Use both label and color.

Recommended fee dashboard:

```txt
Expected
Collected
Pending
Overdue

Collection trend
Class-wise breakdown
Recent payments
Overdue students
```

---

## 12. Exams & Marks

Marks entry should prioritize speed.

Recommended layout:

```txt
Exam
Subject
Class
Maximum marks

Student
Roll No.
Marks
Grade
Remarks
```

Support:

- keyboard entry;
- validation;
- absent state;
- clear save state;
- bulk import where useful.

Never lose valid entered marks after an error.

---

## 13. Timetable

Desktop:

- weekly grid;
- clear periods;
- subject;
- teacher;
- room;
- current period highlight.

Mobile:

- day tabs;
- list layout;
- current and next class prominent.

Do not squeeze a desktop timetable grid onto a phone.

---

## 14. Notices

Notice cards should show:

```txt
Title
Audience
Publisher
Date
Priority
Attachment
```

Priority:

```txt
Normal
Important
Urgent
```

Use urgent styling sparingly.

---

## 15. Forms

Use one-column forms by default.

Use two columns only for short paired fields.

Admission form sections:

```txt
Student details
Guardian details
Academic details
Address
Documents
Fee setup
```

Rules:

- persistent labels;
- inline validation;
- clear required fields;
- sensible defaults;
- draft support for long forms;
- preserve values after errors.

---

## 16. Search & Filters

Large datasets should support:

```txt
Search
Class
Section
Status
Academic year
```

Finance may add:

```txt
Payment status
Date range
Fee category
```

Always show active filters and provide:

```txt
Clear filters
```

---

## 17. Status Chips

Use compact status chips only when useful.

Examples:

```txt
Paid
Pending
Present
Absent
Active
Inactive
Published
Draft
```

Use muted backgrounds.

Do not turn every label into a pill.

---

## 18. States

Every important screen should define:

```txt
Loading
Empty
Error
Success
Disabled
No permission
No results
```

### Empty State

Good:

```txt
No students in this class yet.

Add students to begin managing attendance,
fees, assignments, and results.

[Add student]
```

### Error State

Good:

```txt
Attendance could not be saved.

Your changes are still on this screen.

[Try again]
```

Never silently fail.

---

## 19. Confirmations

Require confirmation for:

- deleting records;
- removing staff;
- reversing payments;
- publishing final results;
- resetting attendance;
- archiving academic years.

Name the affected object.

Bad:

```txt
Are you sure?
```

Better:

```txt
Remove Aarav Sharma from Class 8A?
```

---

## 20. Mobile

Mobile is especially important for teachers, parents, and students.

### Teachers

Prioritize:

- today's classes;
- attendance;
- assignments;
- notices.

### Parents

Prioritize:

- child overview;
- attendance;
- fees;
- results;
- notices.

### Students

Prioritize:

- timetable;
- assignments;
- results;
- notices.

Mobile rules:

```txt
Page padding       16px
Touch targets      >= 44px
Bottom nav         3–5 destinations
Simple actions     bottom sheet where appropriate
```

Do not simply shrink desktop UI.

---

## 21. Responsive Behavior

Suggested breakpoints:

```txt
sm  640px
md  768px
lg  1024px
xl  1280px
```

On smaller screens:

- collapse sidebar;
- reduce dashboard columns;
- prioritize table columns;
- move complex filters into a sheet;
- simplify charts;
- keep primary actions visible.

---

## 22. Charts

Use charts only when they answer a real question.

Examples:

- How is attendance changing?
- How much fee remains unpaid?
- Which classes have lower attendance?
- How has academic performance changed?

Use:

```txt
Line    trends
Bar     comparisons
Donut   simple ratios only
Table   exact operational data
```

Avoid decorative charts and 3D visuals.

---

## 23. Notifications

Notifications should help users act.

Good examples:

```txt
14 students absent today
₹84,000 fees overdue
Math marks pending for Class 9B
3 admission applications awaiting review
```

Prioritize operational value over generic activity.

---

## 24. Accessibility

Minimum standard:

- WCAG AA contrast;
- visible focus;
- keyboard-friendly forms;
- semantic HTML;
- proper labels;
- 44px touch targets;
- color is never the only signal;
- reduced-motion support.

---

## 25. Components

Core reusable components:

```txt
Button
Input
Select
Date picker
Search
Tabs
Table
Card
KPI card
Status chip
Modal
Sheet
Dropdown
Tooltip
Toast
Pagination
Empty state
Skeleton
Avatar
Breadcrumb
Sidebar item
```

Relevant states:

```txt
Default
Hover
Focus
Disabled
Loading
Error
Selected
```

---

## 26. Content Style

Use simple, direct language.

Prefer:

```txt
Add student
Mark attendance
Publish result
Record payment
Create notice
```

Avoid:

```txt
Initiate creation
Proceed
Execute
Submit data
```

Use sentence case.

---

## 27. AI Features

If Classloom includes AI, keep it contextual.

Good use cases:

- summarize student progress;
- draft notices;
- identify attendance trends;
- summarize class performance;
- help create assignments;
- answer questions from school data.

Do not force a chatbot into every workflow.

AI should clearly state:

- what data it used;
- what it generated;
- whether output is editable;
- whether an action has already been executed.

---

## 28. Trust & Privacy

School data is sensitive.

Classloom should clearly communicate:

- role permissions;
- who can access records;
- who changed important data;
- private information;
- audit history where necessary.

Never expose student data unnecessarily.

---

## 29. Classloom Signature

The Classloom visual identity should come from:

```txt
Clear academic structure
+ strong blue/indigo accent
+ calm neutral surfaces
+ excellent tables
+ clear status language
+ friendly, precise typography
+ restrained school-specific visuals
```

The product should feel:

```txt
Professional
+ approachable
+ organized
+ trustworthy
```

Not childish.

Not generic enterprise accounting software.

---

## 30. Final QA

Before approving a screen:

- [ ] Primary purpose is obvious.
- [ ] Primary action is obvious.
- [ ] Important information appears first.
- [ ] Spacing and typography are consistent.
- [ ] Realistic content has been tested.
- [ ] Loading, empty, and error states exist.
- [ ] Mobile behavior is intentional.
- [ ] Keyboard/focus behavior works.
- [ ] Status is understandable without color.
- [ ] Decoration is restrained.

Final question:

> Can a busy administrator, teacher, parent, or student understand this screen and complete the task without training?

If not, simplify the hierarchy before adding more polish.
