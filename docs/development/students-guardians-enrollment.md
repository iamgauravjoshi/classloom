# Students, guardians, and enrollment (Phase 6)

Run `pnpm db:migrate` after pulling Phase 6. Migration `0011` creates tenant-wide student and guardian profiles, relationships, school admission periods, academic placement history, and import batch metadata. It also applies forced tenant RLS, runtime-role grants, tenant-safe foreign keys, uniqueness rules, and the school-scoped student, guardian, and enrollment permissions. If the local runtime role is missing, follow [local setup](local-setup.md) first.

## School administrator workflow

Sign in with an active tenant or school administrator account. In `/academic-setup`, create a session, class, and section. Open `/students` to search by name or code and filter by school, status, session, class, or section. Choose **Add student** to enter identity, admission number and date, first placement, and optional guardian contacts. Saving creates the student, admission, placement, and guardian links in one transaction. A failed placement does not leave a partial profile. One student code identifies a person across schools within a tenant.

The student profile has Overview, Guardians, Enrollment history, and Account access tabs. Add a guardian or change responsibility flags in Guardians. The API creates a new guardian and relationship atomically. Enrollment history retains closed records. Transfer closes the current placement and creates the destination placement; withdraw or complete closes every active placement under that school admission and the admission period. A returning student can receive a new school admission. The confirmation dialog states the action before it is saved. The guardian directory shows people linked to school-visible students; a guardian profile shows only student links visible at the selected school.

Student and guardian profiles do not provide login access by themselves. To link one, invite an account through the trusted [authentication workflow](authentication.md), then use Account access to choose an eligible active tenant membership. The API enforces account-link eligibility, shared-profile management at every active school, and school-specific read/manage rights. Tenant identity comes from the authenticated session, never a browser-supplied tenant ID. All browser mutations use the same-origin proxy, exact-origin check, and `X-ClassLoom-Request: 1` marker.

## CSV bulk import

Choose **Import CSV** from `/students`. The browser checks the `.csv` extension, nonempty file, and 2 MiB limit, then asks the API to inspect headers and sample rows. Map source columns to fields, preview every row, fix reported row and field errors, and commit only after a clean preview. Files must be UTF-8, comma-delimited, have a header row and at most 1,000 data rows. Each row represents one student and at most one guardian relationship; repeat student codes on separate rows for multiple guardians, or guardian codes for siblings.

Required mappings: `studentCode`, `studentGivenName`, `studentFamilyName`, `dateOfBirth`, `admissionNumber`, `sessionCode`, `classCode`, and `sectionCode`. Optional student fields include middle/preferred name, gender, email, phone, and roll number. If any guardian column is mapped, also map `guardianCode`, `guardianGivenName`, `guardianFamilyName`, and `relationshipType` (`mother`, `father`, `legal_guardian`, `grandparent`, `sibling`, or `other`). Other guardian contact and address columns are optional. Each source column can map to only one field. Codes identify existing people when their provided shared fields agree; conflicting fields, invalid email/country values, and incompatible existing relationship types are preview errors. A compatible reimport preserves the relationship's contact flags and status. Initial admission and placement dates use the matched academic session's start date because this CSV version has no date columns.

Preview writes no people or enrollment records. Commit revalidates the file and mapping and writes the entire batch in one transaction. Invalid rows write nothing. The browser retains the same idempotency key after a retryable commit failure, so a successful retry returns the original batch result without duplicates. The batch table stores only checksum, actor, key, status, counts, and timestamps; it never stores the CSV contents. Commit requires `student.manage`, `guardian.manage`, and `enrollment.manage` at the selected school.

## Synthetic local data and verification

After migration and academic setup, seed an existing local tenant and school with:

```powershell
pnpm db:seed-phase6-demo -- --tenant <slug-or-id> --school <code-or-id> --seed 2606
```

The command requires explicit targets, refuses production mode, uses Faker only as a development dependency, and creates deterministic `DEMO-` records. Rerunning skips those records; it does not create accounts or invitations. Use your own local tenant slug or ID and school code or ID in place of the placeholders.

For verification, run `pnpm lint`, `pnpm typecheck`, `pnpm exec dotenv -e .env -- pnpm test`, `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test:e2e`, and `pnpm build`. Database-backed checks require the local PostgreSQL role, migrations, and `.env` credentials. The Phase 6 API E2E files are `apps/api/src/enrollment/enrollment.e2e-spec.ts` and `student-import.e2e-spec.ts`.
