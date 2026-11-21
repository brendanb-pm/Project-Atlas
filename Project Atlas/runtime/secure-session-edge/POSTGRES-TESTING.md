# Disposable PostgreSQL 17 tests

Run these commands from `Project Atlas/runtime/secure-session-edge` with Node 20–24 and a running local Docker engine with Docker Compose 2.24.4 or newer.

- Bootstrap dependencies with `npm ci`.
- Run integration tests with `npm run test:postgres`.

The integration command starts a fresh PostgreSQL 17 container using the same image as local development. It waits for TCP readiness and runs the existing MOS-133G rehearsal using generated credentials and a dynamically assigned loopback port. The rehearsal creates a disposable database and separate migration and application roles, applies the current migration chain, loads synthetic fixtures, and checks application reads, constraints, rollback, retries, and migration status. Each invocation uses a unique Compose project and an in-memory data directory. The command shuts down that project after the run and prints the project name if cleanup fails.

The workflow runs this same command on a GitHub-hosted runner. It covers the migration chain and PostgreSQL persistence boundary exercised by MOS-133G. MOS-138 and subsequent protected preproduction suites, live OIDC, and tenant-hosted operator acceptance require their own authorized setup.
