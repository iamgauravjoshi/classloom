# Phase 9: Attendance

Attendance provides school staff with a daily register for a section in an academic session. The roster comes from active Enrollment records. Each student has one of four statuses: present, absent, late, or excused.

## Workflow

1. Choose a school, academic session, section, and school-local date.
2. Review the current enrolled roster and mark individual students or apply “all present” or “all absent”.
3. Save the complete roster as one operation. The server rejects duplicate, missing, extra, or no-longer-active enrollments; it does not partially save a register.
4. Correct statuses later as needed. Every actual change records the previous status, new status, actor, and time in append-only event history.

The date must fall within the selected academic session and cannot be later than the school's current local date. The server uses the school's IANA timezone to determine the current date; browser timezone settings do not change this rule.

## Access

`attendance.read` and `attendance.record` are school-scoped permissions. Authorized school staff can read registers; recording and corrections require `attendance.record`. A linked, eligible teacher is limited to sections assigned to their teacher profile. The API resolves the tenant from the active authenticated membership and independently enforces permission and section access on every request.

## Interface

The Attendance page offers school, session, section, and calendar date selection; a desktop table and narrow-screen student cards; bulk-present/bulk-absent actions; status controls; save progress; completion count; and correction history. It uses the project's shadcn Base UI components and disables future dates in the calendar, while server validation remains authoritative.

## Boundaries

This phase does not include guardian self-service, biometric capture, attendance notifications, analytics, or bulk historical imports. One register is saved per school/session/section/date. Missing attendance is not inferred as absent; staff must explicitly record a status.
