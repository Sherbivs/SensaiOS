-- Database Health & Workflow Check (Read-only)
-- Attach this console to your target data source and run.
-- All operations are SELECT-only and wrapped in a ROLLBACK.

begin;

-- 0) Connection info
select
  current_database() as database,
  current_schema()   as schema,
  current_user       as user_name,
  inet_server_addr() as server_ip,
  inet_server_port() as server_port,
  version()          as postgres_version;

-- 1) Migration status (Prisma)
select count(*) as migration_count from "public"."_prisma_migrations";

select
  "id",
  "migration_name",
  "started_at",
  "finished_at",
  "applied_steps_count"
from "public"."_prisma_migrations"
order by "finished_at" desc nulls last, "started_at" desc nulls last
limit 5;

-- 2) Key table counts
select
  (select count(*) from "public"."Species")         as species_count,
  (select count(*) from "public"."Trainer")         as trainer_count,
  (select count(*) from "public"."PokemonInstance") as pokemon_count,
  (select count(*) from "public"."Battle")          as battle_count;

-- 3) Data integrity probes
-- 3a) Pokemon referencing missing Trainer
select count(*) as orphaned_pokemon_trainer
from "public"."PokemonInstance" pi
left join "public"."Trainer" t on t."id" = pi."trainerId"
where pi."trainerId" is not null
  and t."id" is null;

-- 3b) Pokemon referencing missing Species
select count(*) as invalid_pokemon_species
from "public"."PokemonInstance" pi
left join "public"."Species" s on s."id" = pi."speciesId"
where pi."speciesId" is not null
  and s."id" is null;

-- 4) Recent activity
select date_trunc('day', t."createdAt") as day, count(*) as new_trainers
from "public"."Trainer" t
where t."createdAt" > now() - interval '7 days'
group by 1
order by 1;

select date_trunc('day', p."createdAt") as day, count(*) as new_catches
from "public"."PokemonInstance" p
where p."createdAt" > now() - interval '7 days'
group by 1
order by 1;

select b."state", count(*) as battles_last_30d
from "public"."Battle" b
where b."startedAt" > now() - interval '30 days'
group by b."state"
order by battles_last_30d desc nulls last;

-- 5) Spot checks (small samples)
select "id", "name", "slug"
from "public"."Species"
order by "id" asc
limit 5;

select "id", "nickname", "speciesId", "level", "createdAt"
from "public"."PokemonInstance"
order by "createdAt" desc nulls last
limit 5;

rollback;
