-- Dev DB Connection Console (Read-only)
-- 
-- How to use:
-- 1) Load DEV env secrets into your shell (PowerShell):
--      pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env" -Persist
--    If you were previously on the Accelerate proxy, switch the Prisma client back to direct:
--      npx prisma generate
--
-- 2) Optional quick health check via CLI (should succeed if the env is loaded correctly):
--      npm run db:cli -- status
--
-- 3) In your IDE, create/select a Data Source using the direct Postgres URL from the loaded environment (DATABASE_DIRECT_URL).
--    Attach this console to that Data Source, then run the checks below.

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
