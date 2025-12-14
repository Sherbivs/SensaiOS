-- Dev DB Connection Console (Read-only)
-- PostgreSQL Dialect
-- 
-- How to use:
-- 1) Load environment secrets into your shell (PowerShell):
--      pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist
--    Ensure Prisma client is using direct PostgreSQL mode:
--      npx prisma generate
--
-- 2) Optional quick health check via CLI (should succeed if the env is loaded correctly):
--      npm run db:cli -- status
--
-- 3) In your IDE, create/select a Data Source using the Render database URL from the loaded environment:
--    - Production (Render services): Use RENDER_DB_INTERNAL_URL (internal network)
--    - Development (laptop): Use DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL (external access)
--    Attach this console to that Data Source, then run the checks below.
--
-- NOTE: SQL linter warnings below are false positives - these are valid PostgreSQL functions.

-- Connection and server info
select
  current_database() as database,
  current_user      as user_name,
  inet_server_addr() as server_ip,
  inet_server_port() as server_port,
  version()          as postgres_version;

-- Timestamps
select now() as local_now, now() at time zone 'utc' as utc_now;

-- Optional schema probes (uncomment if the tables exist; these will error if absent)
-- select count(*) as species_count from "Species";
-- select count(*) as bus_message_count from "BusMessage";

-- Keep it read-only; if you open a transaction, roll it back.
begin;
-- Place additional read-only SELECTs here as needed.
rollback;
