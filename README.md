# ClassLoom

ClassLoom is a production-grade, multi-tenant School Management System SaaS designed to help schools manage academic, administrative, operational, and financial workflows from a single platform.

The system is being built with scalability, maintainability, security, tenant isolation, and long-term product evolution in mind.

---

## Overview

ClassLoom is intended to provide a unified platform for managing the day-to-day operations of schools.

The platform is designed for multiple stakeholders, including:

- School administrators
- Principals
- Teachers
- Students
- Parents
- Accountants
- Librarians
- Transport staff
- Other school employees

Each school operates as an isolated tenant within the SaaS platform.

ClassLoom is being developed incrementally, with each major feature documented, designed, implemented, tested, and integrated into the broader architecture.

The foundation includes tenant-isolated PostgreSQL data, email/password accounts with server-side sessions, and tenant-scoped roles and permissions. Authorization checks use the active membership from the session; school and campus checks require a server-resolved resource scope. Phase 4 adds school-scoped academic sessions, classes, sections, subjects, teacher assignments, and activation. Academic setup uses `school.read` and `school.manage` against the requested school. The separate academic and person-relationship permission scopes remain denied until their modules provide resource resolvers.

---

## Core Goals

ClassLoom is designed around the following principles:

- Multi-tenant SaaS architecture
- Strong tenant isolation
- Modular and maintainable backend architecture
- Secure role- and permission-based access
- Scalable relational data model
- Clear domain ownership
- Production-grade engineering practices
- Comprehensive automated testing
- Consistent product and architecture documentation
- Responsive and accessible user experience
- Incremental feature development
- Long-term maintainability

---

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- ESLint
- Modern server/client rendering patterns

Application:

```text
apps/web
```

### Backend

- NestJS
- TypeScript
- Modular monolith architecture
- REST APIs
- Explicit domain/module boundaries
- Server-side authorization

Application:

```text
apps/api
```

### Database

- PostgreSQL
- Drizzle ORM
- Drizzle migrations

Package:

```text
packages/db
```

### Workspace and Tooling

- pnpm workspaces
- Node.js
- Vitest
- Oxlint
- Prettier
- Docker Compose

---

## Repository Structure

```text
classloom/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   └── AGENTS.md
│   │
│   └── api/
│       ├── src/
│       └── test/
│
├── packages/
│   └── db/
│       ├── src/
│       └── migrations/
│
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── decisions/
│   └── development/
│
├── AGENTS.md
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

### `apps/web`

Contains the ClassLoom Next.js frontend.

Frontend-specific development instructions are defined in:

```text
apps/web/AGENTS.md
```

Read this file before making changes to the web application.

---

### `apps/api`

Contains the NestJS backend.

The API follows a modular monolith architecture.

Business domains should remain encapsulated within their modules and communicate through explicit contracts rather than directly depending on another module's persistence implementation.

End-to-end tests are located in:

```text
apps/api/test/
```

---

### `packages/db`

Contains the shared database infrastructure, including:

- Drizzle schemas
- Database access configuration
- Generated migrations
- Database utilities

Database schema changes must be implemented here.

---

### `docs/product`

Contains product-level documentation such as:

- Feature definitions
- User workflows
- Roles
- Permissions
- Business requirements
- Acceptance criteria
- Product scope

---

### `docs/architecture`

Contains technical architecture documentation such as:

- System architecture
- Module boundaries
- Data flow
- Authentication architecture
- Authorization architecture
- Multi-tenancy design
- Integration architecture
- Technical diagrams

---

### `docs/decisions`

Contains Architecture Decision Records.

ADRs document significant engineering decisions that may affect the long-term architecture of ClassLoom.

---

### `docs/development`

Contains developer-focused documentation including:

- Local development instructions
- Coding conventions
- Testing practices
- Development workflows
- Contribution guidelines

---

# Architecture

## Modular Monolith

The ClassLoom backend is implemented as a modular monolith.

The application is deployed as a unified backend while maintaining strong logical boundaries between business domains.

Conceptually:

```text
                    ┌────────────────────┐
                    │     ClassLoom      │
                    │       API          │
                    └─────────┬──────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    Student Module      Attendance Module    Fees Module
          │                   │                   │
          │                   │                   │
          ├──────────┐        │        ┌──────────┤
          │          │        │        │          │
          ▼          ▼        ▼        ▼          ▼
    Enrollment   Academic   Exams   Payments   Accounting

                    │
                    ▼
             PostgreSQL Database
```

Each module owns its business rules and domain behavior.

A module should not treat another module's database tables as its public API.

Cross-module interactions should happen through explicit contracts such as:

- application services
- interfaces
- commands
- queries
- domain events
- application events

---

## Multi-Tenancy

ClassLoom is a multi-tenant SaaS platform.

Each school represents an isolated tenant.

Example:

```text
ClassLoom Platform
│
├── School A
│   ├── Students
│   ├── Teachers
│   ├── Fees
│   └── Attendance
│
├── School B
│   ├── Students
│   ├── Teachers
│   ├── Fees
│   └── Attendance
│
└── School C
    ├── Students
    ├── Teachers
    ├── Fees
    └── Attendance
```

A user belonging to one tenant must never be able to access another tenant's protected resources unless explicitly authorized through platform-level functionality.

Tenant isolation is considered a system invariant.

Tenant-owned modules must include appropriate tenant-isolation integration tests.

---

# Planned Product Domains

ClassLoom is expected to evolve across several business domains.

Examples include:

```text
Platform
├── Authentication
├── Tenant / School Management
├── User Management
├── Role & Permission Management
│
├── Academic Management
│   ├── Academic Years
│   ├── Classes
│   ├── Sections
│   ├── Subjects
│   └── Timetables
│
├── Student Management
│   ├── Admissions
│   ├── Student Profiles
│   ├── Guardians
│   └── Enrollment
│
├── Staff Management
│   ├── Teachers
│   ├── Employees
│   ├── Departments
│   └── Roles
│
├── Attendance
│   ├── Student Attendance
│   └── Staff Attendance
│
├── Examination
│   ├── Exams
│   ├── Marks
│   ├── Grades
│   └── Report Cards
│
├── Finance
│   ├── Fee Structures
│   ├── Fee Collection
│   ├── Payments
│   ├── Discounts
│   └── Financial Reports
│
├── Communication
│   ├── Announcements
│   ├── Notifications
│   └── Parent Communication
│
├── Library
│
├── Transport
│
├── Reports
│
└── Audit & Administration
```

The exact scope of individual phases is maintained in the product documentation.

---

# Prerequisites

Install the following before running ClassLoom locally.

### Node.js

Required version:

```text
Node.js 24.15+
```

Check your installed version:

```bash
node --version
```

---

### pnpm

Required version:

```text
pnpm 11.19+
```

Check:

```bash
pnpm --version
```

---

### Docker

Docker is used to run the local PostgreSQL database.

Ensure Docker and Docker Compose are installed and running.

Check:

```bash
docker --version
docker compose version
```

---

# Local Development Setup

## 1. Clone the repository

```bash
git clone <repository-url>
cd classloom
```

---

## 2. Install dependencies

From the repository root:

```bash
pnpm install
```

---

## 3. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Update the local values if required.

Never commit secrets or production credentials.

---

## 4. Start PostgreSQL

```bash
docker compose up -d db
```

Verify the container is running:

```bash
docker compose ps
```

---

## 5. Configure the runtime database role

```bash
pnpm db:setup-runtime-role
```

---

## 6. Apply database migrations

```bash
pnpm db:migrate
```

---

## 7. Verify database connectivity

```bash
pnpm db:check
```

---

## 8. Start development servers

```bash
pnpm dev
```

By default:

```text
Web Application: http://localhost:3000
API:             http://localhost:4000
```

---

# Common Commands

## Install dependencies

```bash
pnpm install
```

---

## Start development environment

```bash
pnpm dev
```

---

## Lint

```bash
pnpm lint
```

---

## Type checking

```bash
pnpm typecheck
```

---

## Run tests

```bash
pnpm test
```

---

## Production build

```bash
pnpm build
```

---

# Database Commands

## Check database connection

```bash
pnpm db:check
```

---

## Generate migration

After modifying a Drizzle schema:

```bash
pnpm db:generate
```

Generated migrations must be reviewed before being committed.

---

## Apply migrations

```bash
pnpm db:migrate
```

---

## Configure local runtime role

```bash
pnpm db:setup-runtime-role
```

Schema changes and their corresponding generated migrations should be committed together.

---

# Testing

ClassLoom uses Vitest for unit testing.

Unit tests should normally be placed beside the code they cover.

Example:

```text
student.service.ts
student.service.spec.ts
```

Unit tests follow:

```text
*.spec.ts
```

API end-to-end tests follow:

```text
*.e2e-spec.ts
```

and are located under:

```text
apps/api/test/
```

---

## Run all workspace tests

```bash
pnpm test
```

---

## API end-to-end tests

```bash
pnpm --filter @classloom/api test:e2e
```

---

## API test coverage

```bash
pnpm --filter @classloom/api test:cov
```

---

## Tenant Isolation Testing

Every tenant-owned module must include tests that verify tenant boundaries.

For example:

```text
School A creates Student A
School B creates Student B

School A -> can access Student A
School A -> cannot access Student B

School B -> can access Student B
School B -> cannot access Student A
```

Tenant isolation must be tested at the appropriate application and persistence boundaries.

---

# Development Workflow

For non-trivial features, development should generally follow this sequence:

```text
Requirement
    ↓
Product Documentation
    ↓
Architecture / Domain Analysis
    ↓
Data Model
    ↓
Migration
    ↓
Application / Domain Logic
    ↓
API Contract
    ↓
Authorization
    ↓
Persistence
    ↓
Frontend Integration
    ↓
Tests
    ↓
Verification
    ↓
Documentation Update
```

Large features should be broken into smaller, independently verifiable tasks.

Prefer vertical slices that deliver complete behavior over implementing many disconnected layers at once.

---

# Coding Standards

The repository follows `.editorconfig`.

Use:

```text
Encoding:       UTF-8
Line endings:   LF
Indentation:    2 spaces
Final newline:  Required
```

Use TypeScript conventions appropriate to the package being modified.

Avoid:

- unnecessary abstractions
- duplicate infrastructure
- excessive use of `any`
- disabling lint rules without justification
- unrelated refactoring during feature work

Prefer:

- explicit domain terminology
- cohesive modules
- readable code
- small focused functions
- clear contracts
- testable business logic

---

# Frontend Development

The frontend application lives in:

```text
apps/web
```

Before modifying frontend code, read:

```text
apps/web/AGENTS.md
```

Frontend authorization checks should improve user experience but must never replace backend authorization.

For example, hiding a button is not a security control:

```text
Frontend:
"User cannot see Delete Student button"

                    +

Backend:
"DELETE /students/:id checks permission"

                    =

Correct authorization
```

The API remains the authoritative security boundary.

---

# Backend Development

The API lives in:

```text
apps/api
```

The backend follows a modular monolith architecture.

A domain module should encapsulate its business logic.

Typical conceptual structure:

```text
students/
├── application/
├── domain/
├── infrastructure/
├── presentation/
└── students.module.ts
```

The exact implementation should follow the patterns already established in the repository.

Do not introduce a second architectural pattern within a module unless there is a documented reason.

---

# Database Ownership

The database package provides shared infrastructure, but shared access does not imply shared domain ownership.

For example:

```text
Students Module
      │
      │ public contract
      ▼
Attendance Module
```

is preferred over:

```text
Attendance Module
      │
      ▼
Directly manipulating Students tables
```

Modules should interact through explicit domain/application contracts.

---

# Authentication and Authorization

Authentication answers:

```text
Who is the user?
```

Authorization answers:

```text
What is the user allowed to do?
```

All protected operations must enforce authorization server-side.

Security decisions must not rely solely on:

- frontend visibility
- route visibility
- client-provided roles
- client-provided tenant IDs
- UI state

ClassLoom should follow least-privilege access principles.

---

# Security Principles

ClassLoom handles sensitive institutional and personal data.

Potentially sensitive data includes:

- student information
- parent information
- staff information
- academic records
- attendance
- fee records
- contact information
- authentication data
- operational school information

Development must preserve:

- tenant isolation
- authorization boundaries
- secure secret handling
- safe logging
- database integrity
- least privilege

Never commit:

```text
Production credentials
Database passwords
API secrets
Authentication tokens
Private keys
```

Secrets must remain in ignored environment files or secure secret-management systems.

---

# Environment Variables

Development values are documented in:

```text
.env.example
```

Create the local file with:

```bash
cp .env.example .env
```

When introducing a new required environment variable:

1. Add a safe example to `.env.example`.
2. Add runtime validation using the existing configuration mechanism.
3. Document the variable if its purpose is not obvious.
4. Never include real production secrets.

---

# Database Migration Guidelines

When changing the database:

```text
Modify Drizzle Schema
        ↓
pnpm db:generate
        ↓
Review Migration
        ↓
Test Migration
        ↓
pnpm db:migrate
        ↓
Commit Schema + Migration
```

Do not modify an already-applied migration to represent a new production change.

Create another migration instead.

Take particular care with:

- destructive column changes
- `NOT NULL` additions
- foreign keys
- unique constraints
- data type changes
- enum changes
- tenant-scoped uniqueness

---

# Documentation

Documentation is treated as part of the product.

Implementation and documentation should evolve together.

## Product documentation

```text
docs/product
```

Contains the description of what the product should do.

---

## Architecture documentation

```text
docs/architecture
```

Contains documentation about how the system is structured.

---

## Architecture Decision Records

```text
docs/decisions
```

Significant architectural decisions should be recorded as ADRs.

Examples include:

- changing module boundaries
- adopting major infrastructure
- changing multi-tenancy strategy
- changing authentication architecture
- introducing event-driven communication
- introducing caching architecture
- adopting major third-party dependencies

---

## Development documentation

```text
docs/development
```

Contains contributor and engineering workflow documentation.

---

# Repository Agent Instructions

The repository contains `AGENTS.md` files that define instructions for AI coding agents and contributors working in specific parts of the repository.

The root file:

```text
AGENTS.md
```

contains repository-wide engineering and architecture rules.

More specific directories may contain their own instructions:

```text
apps/web/AGENTS.md
apps/api/AGENTS.md
packages/db/AGENTS.md
```

When multiple instruction files apply, follow the closest applicable instructions while preserving repository-wide invariants.

---

# Git Commit Convention

Use concise, scoped commit messages following:

```text
type: imperative summary
```

Examples:

```text
feat: add school onboarding workflow

fix: enforce tenant scope on student lookup

test: add tenant isolation coverage for enrollment

docs: document student admission workflow

refactor: extract attendance policy service
```

Typical commit types include:

```text
feat
fix
docs
test
refactor
chore
build
ci
perf
```

---

# Pull Requests

Pull requests should explain:

- what changed
- why it changed
- affected modules
- relevant product or architecture documents
- database migrations
- commands executed
- tests executed
- known limitations
- follow-up work

Include screenshots for visible UI changes.

Explicitly highlight changes affecting:

- authorization
- tenant isolation
- database schemas
- external integrations
- breaking API behavior

---

# Definition of Done

A feature or change is considered complete when the applicable requirements below have been satisfied:

- Requested behavior is implemented.
- Relevant product requirements are documented.
- Architecture remains consistent.
- Module boundaries are preserved.
- Tenant isolation is enforced.
- Authorization is enforced server-side.
- Database schema and migrations are correct.
- Domain behavior has appropriate tests.
- Tenant isolation has appropriate tests.
- Linting succeeds.
- Type checking succeeds.
- Relevant tests succeed.
- Production build succeeds where applicable.
- Documentation reflects the implementation.
- No unrelated changes were introduced.
- The final diff has been reviewed.

---

# Verification Checklist

Before completing a substantial change, run the relevant checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For API-related changes:

```bash
pnpm --filter @classloom/api test:e2e
```

For database changes:

```bash
pnpm db:check
pnpm db:migrate
```

Do not report a command as passing unless it was actually executed successfully.

---

# Development Philosophy

ClassLoom favors:

```text
Correctness
    ↓
Security
    ↓
Clear Domain Boundaries
    ↓
Maintainability
    ↓
Testability
    ↓
Performance
    ↓
Developer Convenience
```

This does not mean performance or developer experience are unimportant.

It means architectural shortcuts should not compromise:

- tenant isolation
- security
- data integrity
- domain correctness
- maintainability

for short-term convenience.

---

# Project Status

ClassLoom is under active development.

The system is being implemented incrementally, beginning with foundational architecture and progressing through product domains in defined phases.

For current feature scope and implementation plans, refer to:

```text
docs/product
```

For architecture details:

```text
docs/architecture
```

For important engineering decisions:

```text
docs/decisions
```

---

# License

License information will be added according to the project's distribution and commercialization strategy.

Until a license is explicitly provided, the repository should not be assumed to be open source.
