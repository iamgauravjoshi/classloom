# Module boundaries

The NestJS API has a small common foundation for configuration, request context, error handling, logging, and health. Domain modules will be added in order: tenancy/schools/campuses, identity, authorization, academics, people/enrollment, admissions, timetable, attendance, fees/payments, examinations/results, communication/reporting, then rollover.

Each domain module owns its API, application services, domain rules, persistence adapters, and tests. Modules exchange explicit interfaces or domain events for cross-module effects; database tables are not used as implicit public APIs. The SaaS control plane owns provisioning and entitlements. The school application owns operational student data. Platform administrators do not receive automatic access to that data.

The academics module owns academic session, class, section, subject, and teacher assignment records. During Phase 4, an assignment refers to an active tenant membership with a role grant in the school. Phase 5 can link that account to a staff or teacher profile without changing the academic record. Session activation is serialized on the school row, archives the previous active session, and requires a class, section, and subject.
