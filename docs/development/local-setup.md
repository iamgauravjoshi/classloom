# Local setup

Install Node 24.15+ and pnpm 11.19, then follow the root README. Copy `.env.example` to `.env`. The Docker container is published on host port 5433 to avoid conflicts with an existing PostgreSQL installation on port 5432. `DATABASE_URL` points to that local container and must never contain production credentials. The database migration command is safe to rerun. `docker compose down` stops local services without removing the database volume; remove volumes only when you deliberately want a clean local database.
