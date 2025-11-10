# Operations
- CI watchdog runs every 15 minutes; opens an Issue if stuck.
- All runs produce `runs/<ISO8601>/run.json` and `logs/agent-events.jsonl`.
- Post-incident: add a playbook entry; update AGENTS.md if behavior changes.

## DEX v2 Production Cutover (2025-11-05 02:00–03:00 ET)
- **Prereqs:** confirm prod/dev dumps archived under `backups/archive/2025-11-03/`, pack hash `f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00`, and flag plans in `ops/flag-plans/`.
- **Local fallback:** run `npm run ops:auto-bootstrap-local-db` (sets `PG_BIN_DIR`, installs PostgreSQL silently via winget when missing, and hydrates the Store mirror) within 24 hours of the window. Confirm `Store/db/local-url.txt` points at the freshly mirrored cluster and log the timestamp + URL in Tasklist notes so the fallback is auditable before go/no-go. The manual path (`PG_BIN_DIR=<...>/bin` + `npm run ops:bootstrap-local-db`) remains available when you only need a refresh.
- **Command cadence:**
	- `npm run ops:dex-v2-backup -- --env-file <Key/.../.env> --label <prod|dev>` (completed 2025-11-03T05:06Z, rerun only if drift detected).
	- `npm run ops:simulate-flag -- --flag DEX_V2_ENABLED --percent <1|25|50|100> --apply`; the script writes the approved JSON into `ops/flag-plans/` and reminds on-call to upload the plan via the feature flag console when no config URL is present.
	- `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>` to confirm DEV/PROD parity after each ladder step.
- **Mirroring focus:** keep the PROD and DEV datasets aligned before and after each cohort change—log checksum comparisons, auto-sync output, and any manual adjustments in `ops/change-ledger.md`.
- **Security guardrail:** rehearse an unauthorized role change in staging within 12 hours of the window, confirm the security bot auto-reverts with `revertStatus: success`, and ensure DRIP alerts stay quiet before starting the ladder.
- **Storage guardrail:** Render Postgres caps are 0.5 GB (prod) and 1.0 GB (dev). Log Render→Metrics storage utilization plus `npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database()))";` output in Tasklist notes before each ladder step; pause the rollout if either environment exceeds 80% until space is reclaimed or the plan is upsized.
- **Rollback trigger:** disable `DEX_V2_ENABLED` globally if parity checks fail, backups diverge, or the manual verification uncovers mismatched pack hashes.
- **Evidence:** store apply logs, parity check output, and DB checksum notes in `ops/change-ledger.md` once the ladder completes; update Tasklist notes and Prompt PATCHSET echo with the outcome.

### Minute-by-minute timeline
| Window | Primary action | Command owners |
| ------ | -------------- | -------------- |
| T-120 min | Rehearse security bot rollback in staging; simulate an unauthorized role change and capture `revertStatus: success` evidence | Ops on-call + Security |
| T-90 min | Re-run prod/DEV dumps if drift suspected, confirm hashes match ledger | Database DRI |
| T-75 min | Reconfirm pack manifest (`npm run data:dexpack -- --check`) and note hash alongside DB checks | Release lead |
| T-60 min | Run `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>` to verify mirrors before the window | Database DRI |
| T-45 min | Stage config payloads (validate JSON in `ops/flag-plans/`), rehearse `npm run ops:simulate-flag -- --dry-run --apply` for manual console steps | Config owner |
| T-30 min | Confirm backups + parity notes, stage console upload links, brief on-call pair | Config owner + Database DRI |
| T-15 min | Final dry-run (`--dry-run --apply`) to refresh console checklist, snapshot current DB counts | Ops on-call |
| Go (02:00 ET) | Generate 1% plan (`npm run ops:simulate-flag -- --percent 1 --apply`), upload JSON to config console, capture apply logs | Config owner |
| T+10 min | Run parity checks (auto-sync validation + key table counts) and decide go/no-go for 25% | Release lead + Database DRI |
| T+25 min | Apply 25% plan, repeat parity checks | Config owner + Database DRI |
| T+40 min | Apply 50% plan, repeat parity checks | Config owner + Database DRI |
| T+60 min | Apply 100% plan, rerun parity checks, begin post-cutover validation | Release lead |
| T+75 min | Run `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>` and archive outputs | Database DRI |
| T+90 min | Log final parity report in ops/change-ledger.md, update Tasklist | Release lead |

### Roles and communication lanes
- **Release lead:** owns final go/no-go, shepherds config applies, signs off on Tasklist and Prompt updates.
- **Database DRI:** monitors dumps and auto-sync verification, confirms `dexpack` manifest integrity, stages recovery options.
- **Ops on-call:** assists with manual console uploads, cross-checks parity output, and prepares rollback commands if triggered.
- **Escalation:** follow the ladder in playbooks/escalate.md if parity breaks or manual apply fails; document outcomes in `ops/change-ledger.md`.

### Go / no-go checklist
- ❏ Backups verified in `backups/archive/2025-11-03/` with matching SHA256 notes in ops/change-ledger.md.
- ❏ Feature flag plans reviewed and untouched since approval; console credentials confirmed.
- ❏ Local fallback mirror refreshed via `npm run ops:auto-bootstrap-local-db` (or manual equivalent) and recorded in Tasklist (`Store/db/local-url.txt` timestamp + URL present).
- ❏ DEV↔PROD parity confirmed via `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>`.
- ❏ Security bot guardrail rehearsal completed within the last 12 hours with `revertStatus: success` and no lingering `revertErrors` in DRIP alerts or the CLI dashboard.
- ❏ Rollback plan rehearsed (`DEX_V2_ENABLED=false` apply + manual notes updated).
- ❏ Evidence destination ready: ops/change-ledger.md headings created for each ladder step with parity check placeholders.

### Evidence capture template
- For each cohort change, record:
	- Timestamp, command run, console output (trim secrets), config console confirmation.
	- DEV/PROD parity check output (auto-sync validation summary + key table counts).
	- Pack hash verification result (if re-run) and any manual adjustments required.
	- Any anomalies noted; if none, explicitly state "No drift detected".
- Append the above under `## 2025-11-05 DEX v2 Cutover` in ops/change-ledger.md and cross-reference in Tasklist/Prompt summaries.

## Security Bot Guardrail
- Only the guild owner and members with the Administrator permission may change roles or adjust permission bitfields; the security bot auto-reverts other attempts and DM alerts DripTVDD.
- Each alert now includes `revertStatus` (success/failed) and, when rollbacks fail, a `revertErrors` payload listing which role operations could not be applied—page the ops on-call immediately if failures repeat.
- The CLI security panel mirrors the latest alert message and revert status; confirm it stays in a healthy state before and during the DEX v2 cutover window.
- When manual intervention is required, follow playbooks/escalate.md, restore the expected roles, and document the remediation in Tasklist.md plus ops/change-ledger.md.

## Day-One Schema Backup & Recovery (db_v0)
- **Pre-checks:** `npm run db:cli -- status` to confirm the active host (expect direct/Postgres), validate species/user counts, then run
	`npm run db:cli -- query "SHOW wal_level;"` (returns `replica`) and `npm run db:cli -- query "SHOW archive_mode;"` (Render keeps this `off`; rely on managed PITR snapshots).
- **Fresh dump:** `npm run ops:dex-v2-backup -- --env-file C:/Users/sherb/OneDrive/Documents/Key/Dev/.env --label dev --output-dir backups --pg-dump-path tools/pgsql17/pgsql/bin/pg_dump.exe`.
	Wrap in `Measure-Command` for RPO tracking; 2025-11-05 rehearsal completed in 14.79 s and produced `backups/archive/2025-11-05/dev-dex-2025-11-06T00-49-16.472Z.dump`
	(SHA256 `BDC5F48B5414AF99DBBCF0F69D074CE4FABEA27BF7078D5E586442FD0A76C7FD`).
- **Restore rehearsal:** `tools/pgsql17/pgsql/bin/pg_restore.exe --format=custom --schema-only --no-owner --file %TEMP%/dev-dex-YYYY-MM-DD-schema.sql <dump>`;
	the 2025-11-05 run unpacked the schema in 0.09 s, yielding a 43 KB SQL extract suitable for replay during outages.
- **RPO / RTO:** Treat the fresh dump latency as RPO (<15 s in the latest rehearsal) and log schema extraction timings as the quick-restore RTO baseline (0.09 s).
	Capture both metrics plus command transcripts in `ops/ARCHIVE/db-bootstrap/<date>-backup-dr-evidence.md`.
- **Housekeeping:** Move validated dumps into `backups/archive/<YYYY-MM-DD>/`, delete temporary SQL extracts from `%TEMP%`, and reference the archive note in Tasklist/Prompt updates so auditors can trace the rehearsal.
