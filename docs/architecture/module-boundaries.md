# Module boundaries

The NestJS API has a small common foundation for configuration, request context, error handling, logging, and health. Domain modules will be added in order: tenancy/schools/campuses, identity, authorization, academics, people/enrollment, admissions, timetable, attendance, fees/payments, examinations/results, communication/reporting, then rollover.

Each domain module owns its API, application services, domain rules, persistence adapters, and tests. Modules exchange explicit interfaces or domain events for cross-module effects; database tables are not used as implicit public APIs. The SaaS control plane owns provisioning and entitlements. The school application owns operational student data. Platform administrators do not receive automatic access to that data.
