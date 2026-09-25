# Local setup

Install Node 24.15+ and pnpm 11.19, then follow the root README. Copy `.env.example` to `.env`. The Docker container is published on host port 5433 to avoid conflicts with an existing PostgreSQL installation on port 5432. `DATABASE_URL` is the limited API runtime role; `DATABASE_MIGRATION_URL` and `DATABASE_PROVISIONER_URL` are privileged local development connections and must never contain production credentials or be exposed to the browser.

Start PostgreSQL with `docker compose up -d db`, then run `pnpm db:setup-runtime-role` followed by `pnpm db:migrate`. The role setup command is safe to rerun; migrations are safe to rerun.

Provision a starter tenant and school with:

```powershell
pnpm db:provision-tenant -- --name "Demo School Group" --slug demo-school-group --school-name "Demo School" --school-code DEMO --timezone Asia/Kolkata --currency INR
```

The slug must be unique across tenants; use a different slug if you provision more than once. The provisioning URL is for trusted server-side bootstrap only and must not be exposed to a browser. `docker compose down` stops local services without removing the database volume; remove volumes only when you deliberately want a clean local database.
