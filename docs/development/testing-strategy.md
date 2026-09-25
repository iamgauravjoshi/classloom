# Testing strategy

Run lint, strict typecheck, unit tests, and builds on every change. Domain rules get focused unit tests. Database adapters and API behavior get integration tests against PostgreSQL. Critical school workflows get end-to-end tests as their modules arrive. Tenant isolation is a mandatory integration gate for every tenant-owned module starting in Phase 1. Tenant integration tests must connect through the non-owner `classloom_runtime` role; database setup and migrations use `DATABASE_MIGRATION_URL`.

Phase 0 tests API health and error envelopes, configuration validation, database connectivity and migration repeatability, and navigation visibility. Browser smoke checks cover desktop/mobile shell, theme, keyboard navigation, loading, and empty states. Tests use deterministic fixtures; generated demo data is never a security test substitute.
