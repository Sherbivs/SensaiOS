# Operations
- CI watchdog runs every 15 minutes; opens an Issue if stuck.
- All runs produce `runs/<ISO8601>/run.json` and `logs/agent-events.jsonl`.
- Post-incident: add a playbook entry; update AGENTS.md if behavior changes.

## DEX v2 Production Cutover (2025-11-05 02:00–03:00 ET)
- **Prereqs:** confirm prod/dev dumps archived under `backups/archive/2025-11-03/`, pack hash `f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00`, and flag plans in `ops/flag-plans/`.
- **Command cadence:**
	- `npm run ops:dex-v2-backup -- --env-file <Key/.../.env> --label <prod|dev>` (completed 2025-11-03T05:06Z, rerun only if drift detected).
	- `npm run ops:simulate-flag -- --flag DEX_V2_ENABLED --percent <1|25|50|100> --apply`; the script writes the approved JSON into `ops/flag-plans/` and reminds on-call to upload the plan via the feature flag console when no config URL is present.
	- `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>` to confirm DEV/PROD parity after each ladder step.
- **Mirroring focus:** keep the PROD and DEV datasets aligned before and after each cohort change—log checksum comparisons, auto-sync output, and any manual adjustments in `ops/change-ledger.md`.
- **Rollback trigger:** disable `DEX_V2_ENABLED` globally if parity checks fail, backups diverge, or the manual verification uncovers mismatched pack hashes.
- **Evidence:** store apply logs, parity check output, and DB checksum notes in `ops/change-ledger.md` once the ladder completes; update Tasklist notes and Prompt PATCHSET echo with the outcome.

### Minute-by-minute timeline
| Window | Primary action | Command owners |
| ------ | -------------- | -------------- |
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
- ❏ DEV↔PROD parity confirmed via `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>`.
- ❏ Rollback plan rehearsed (`DEX_V2_ENABLED=false` apply + manual notes updated).
- ❏ Evidence destination ready: ops/change-ledger.md headings created for each ladder step with parity check placeholders.

### Evidence capture template
- For each cohort change, record:
	- Timestamp, command run, console output (trim secrets), config console confirmation.
	- DEV/PROD parity check output (auto-sync validation summary + key table counts).
	- Pack hash verification result (if re-run) and any manual adjustments required.
	- Any anomalies noted; if none, explicitly state "No drift detected".
- Append the above under `## 2025-11-05 DEX v2 Cutover` in ops/change-ledger.md and cross-reference in Tasklist/Prompt summaries.

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
