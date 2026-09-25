# ADR-0001: Modular monolith

**Status:** Accepted

**Context:** The MVP has many dependent school workflows but no demonstrated need for separate deployable services.

**Decision:** Use a Next.js web app and one NestJS modular API backed by PostgreSQL. Keep module contracts explicit.

**Alternatives:** Microservices increase operational and consistency costs; a single full-stack app reduces deployment units but weakens the requested API/domain separation.

**Consequences:** Modules can share one transaction boundary while their interfaces remain extractable if scale later justifies it.
