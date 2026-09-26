# Module boundaries

The NestJS API has a small common foundation for configuration, request context, error handling, logging, and health. Domain modules will be added in order: tenancy/schools/campuses, identity, authorization, academics, people/enrollment, admissions, timetable, attendance, fees/payments, examinations/results, communication/reporting, then rollover.

Each domain module owns its API, application services, domain rules, persistence adapters, and tests. Modules exchange explicit interfaces or domain events for cross-module effects; database tables are not used as implicit public APIs. The SaaS control plane owns provisioning and entitlements. The school application owns operational student data. Platform administrators do not receive automatic access to that data.

The academics module owns academic session, class, section, subject, and teacher assignment records. Assignments continue to reference tenant membership IDs. For new assignments, Academics calls `PeopleService.canAssignTeacher` within the tenant transaction; it does not read People tables directly. People checks for a linked active teacher affiliation, teacher profile, active account and membership, and a school grant. Older assignments remain readable even if the account has no profile or is disabled. Session activation is serialized on the school row, archives the previous active session, and requires a class, section, and subject.

The People module owns tenant-wide staff identity, school affiliations, teacher details, account-link rules, and staff APIs. It enforces school-scoped `staff.read` and `staff.manage`. Shared profile and account changes need manage permission at every affiliated school. Creating a staff profile never creates an identity account or invitation.
