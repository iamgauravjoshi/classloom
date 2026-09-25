# Architecture overview

ClassLoom starts as a TypeScript modular monolith: a Next.js web app, a NestJS REST API, and PostgreSQL. The API owns business rules and authorization. The web app owns presentation and client interactions. The database package owns schema and versioned migrations. Deployment may scale web and API independently without splitting domain services prematurely.

The API contract is versioned at `/api/v1`. Request IDs travel in the `x-request-id` response header and error body. OpenAPI describes endpoints. Local PostgreSQL runs through Docker Compose. Redis, workers, and object storage are introduced only when a specific feature needs them.

The [multi-tenancy design](multi-tenancy.md) and [identity/access design](identity-and-access.md) define boundaries before business modules begin.
