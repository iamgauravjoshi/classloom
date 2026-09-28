# Phase 8: Timetable

## Purpose

Phase 8 gives school staff a weekly timetable for recurring class and section lessons. Staff can review a draft, resolve scheduling conflicts, and publish the schedule. Authorized readers can browse the published schedule by section or teacher.

The first release covers weekly schedules only. It does not include daily substitutions, one-off date changes, rotating week cycles, campus-specific schedules, or bell-schedule authoring.

## Scope and ownership

One timetable belongs to one tenant, school, and academic session. The Timetable domain owns slots, schedule lifecycle, conflict validation, and audit events. Academics remains the owner of sessions, classes, sections, subjects, and teacher assignments. People remains the owner of staff profiles and teacher eligibility.

Each slot records a weekday (Monday through Sunday), local start and end times, section, subject, optional eligible teacher assignment, and optional room label. Times are recurring school-local wall-clock times and are not converted between time zones. A slot without an assignment is displayed as **Teacher unassigned**.

## Permissions

- `timetable.manage` allows editing and publishing a schedule for a school. Tenant and school administrators receive this permission through the existing role templates.
- `timetable.read` allows viewing a published schedule. Principal, teacher, and auditor templates receive the read grant.

The API checks school permissions for every request. Hiding actions in the web client does not grant or deny access.

## Staff workflow

1. Open **Timetable**, select a school and academic session, and choose an optional section or teacher filter.
2. A manager creates weekly slots by selecting the section, subject, optional assigned teacher, weekday, start/end time, and optional room.
3. The manager reviews the draft and publishes it when the schedule is ready.
4. A reader sees only published schedules. If a manager edits a published schedule, it returns to draft and stays hidden from readers until it is published again.

Desktop shows a week grid with a column for each day. Narrow screens use weekday tabs and show that day's ordered lessons. Readers without a published timetable see an explanatory empty state. Manager forms show validation and conflict details near the changed slot.

## Conflict and validation rules

Start time must be earlier than end time. Overlapping slots on the same weekday are rejected when they share a section, an assigned teacher, or a non-empty room label. Room matching trims surrounding whitespace and ignores letter case. Slots that meet end-to-start are adjacent and allowed.

Assigned teachers must have an Academic assignment for the same session, section, and subject and must still be eligible at that school. Cross-school or unavailable academic references are not disclosed. Timetable writes serialize on the schedule record before conflict checks.

Editing a published schedule returns it to draft. Readers cannot see draft changes. Publishing validates the schedule and records the publication event atomically.

## Local sample timetable data

The explicit `pnpm db:seed-phase8-demo` command targets one tenant, school, and session. It requires an existing demo-coded class and section (Phase 6 creates `DEMO-G8`, `DEMO-A`, and `DEMO-B`) and an active membership for audit attribution. It creates missing reserved `DEMO-TT-*` subjects and keyed timetable slots with deterministic Faker room data. It uses eligible existing assignments when available and otherwise leaves slots unassigned.

Reruns reuse matching reserved keys. A conflicting slot is skipped without changing that slot. The seeder refuses production mode and does not create accounts, credentials, invitations, staff profiles, or non-demo classes. See [local setup](../development/local-setup.md) for the command and target arguments.

## Related decisions

- [ADR-0007: School-session weekly timetable ownership and publication](../decisions/ADR-0007-phase-8-timetable.md)
- [Module boundaries](../architecture/module-boundaries.md)
