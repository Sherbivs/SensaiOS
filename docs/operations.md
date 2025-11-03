# Operations
- CI watchdog runs every 15 minutes; opens an Issue if stuck.
- All runs produce `runs/<ISO8601>/run.json` and `logs/agent-events.jsonl`.
- Post-incident: add a playbook entry; update AGENTS.md if behavior changes.

## DEX v2 Production Cutover (2025-11-05 02:00–03:00 ET)
- **Prereqs:** confirm prod/dev dumps archived under `backups/archive/2025-11-03/`, pack hash `f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00`, and flag plans in `ops/flag-plans/`.
- **Command cadence:**
	- `npm run ops:dex-v2-backup -- --env-file <Key/.../.env> --label <prod|dev>` (completed 2025-11-03T05:06Z, rerun only if drift detected).
	- `npm run ops:simulate-flag -- --flag DEX_V2_ENABLED --percent <1|25|50|100> --apply`; the script writes the approved JSON into `ops/flag-plans/` and (when run without a config URL) reminds on-call to upload the plan via the feature flag console.
	- `npm run ops:dex-v2-alert-dry-run -- --webhook <override>` if the Ops channel webhook needs validation before announcements.
- **Communications:** circulate the #ops-release message (template in docs/dex-v2-design.md) at T-30 with Engineering/Ops/Security approval before sending.
- **Message snippets:** copy the "Pre-approved message" and "Follow-up" lines in docs/dex-v2-design.md §T-30 to avoid improvising during the window; update ops/change-ledger.md with the exact text posted.
- **Monitoring:** track Grafana `dex.metrics.lookup` p95/p99, Render alerts for `dex.verifier`, `/ops cache` for facade health, and Discord DM smoke checks in the canary guild.
- **Rollback trigger:** disable `DEX_V2_ENABLED` via config service if lookup p99 > 500 µs for >5 minutes, verifier fails pack signature, or canary error rate exceeds baseline by 2×.
- **Evidence:** store apply logs, webhook payloads, and monitoring screenshots in `ops/change-ledger.md` once the ladder completes; update Tasklist notes and Prompt PATCHSET echo with the outcome.

### Minute-by-minute timeline
| Window | Primary action | Command owners |
| ------ | -------------- | -------------- |
| T-90 min | Re-run prod/DEV dumps if drift suspected, confirm hashes match ledger | Database DRI + observer |
| T-75 min | Reconfirm pack manifest (`npm run data:dexpack -- --check`) and publish hash to ops thread | Release lead |
| T-60 min | Verify alert webhook (`npm run ops:dex-v2-alert-dry-run -- --webhook <override>`), enable Grafana rule, set `DEX_V2_CANARY_TAG` in Render | Observability DRI |
| T-45 min | Stage config payloads (validate JSON in `ops/flag-plans/`), rehearse `npm run ops:simulate-flag -- --dry-run --announce` | Config owner + comms lead |
| T-30 min | Final approvals, send #ops-release message, pin dashboards | Comms lead (with Eng/Ops/Sec approvals) |
| T-15 min | Post dry-run payload to Ops channel, run `/ops cache` + `/ops dex status` smoke in canary guild | Ops on-call |
| Go (02:00 ET) | Generate 1% plan (`npm run ops:simulate-flag -- --percent 1 --apply`), upload JSON to config console, capture logs | Config owner |
| T+10 min | Review metrics, decide go/no-go for 25% | Release lead + observability DRI |
| T+25 min | Apply 25% plan, monitor | Config owner |
| T+40 min | Apply 50% plan, monitor | Config owner |
| T+60 min | Apply 100% plan, announce follow-up message, start post-cutover verification | Release lead |
| T+75 min | Run `node scripts/dev_prod_auto_sync.ts --validate-pack --prod-env <env>` and archive outputs | Database DRI |
| T+90 min | Close temporary Grafana rule, snapshot dashboards, update ledger/Tasklist | Release lead + comms lead |

### Roles and communication lanes
- **Release lead:** owns final go/no-go, shepherds config applies, signs off on Tasklist and Prompt updates.
- **Database DRI:** monitors dumps and auto-sync verification, confirms `dexpack` manifest integrity, stages recovery options.
- **Observability DRI:** manages Grafana rules, Render alert routing, and dashboard snapshots; files pager escalation if thresholds breach.
- **Comms lead:** prepares #ops-release copy, ensures approvals, mirrors status to leadership, posts follow-up once 100% is stable.
- **Ops on-call:** runs `/ops` smoke checks, confirms Discord surface health, backstops rollback commands if triggered.
- **Escalation:** use `#ops-alarms` for alerts, `#ops-release` for status, and pager escalation chain as documented in playbooks/escalate.md.

### Go / no-go checklist
- ❏ Backups verified in `backups/archive/2025-11-03/` with matching SHA256 notes in ops/change-ledger.md.
- ❏ `DEX_V2_CANARY_TAG`, Render secrets, and feature flag plans reviewed and untouched since approval.
- ❏ Grafana temporary rule active and alert webhook tested within the last hour.
- ❏ Ops message drafted, stamped with Eng/Ops/Sec approvals, copied into clipboard for T-30 dispatch.
- ❏ `/ops cache` and `/ops dex status` succeed in canary guild using production tokens.
- ❏ Rollback plan rehearsed (`DEX_V2_ENABLED=false` apply + notification text).
- ❏ Evidence destination ready: ops/change-ledger.md headings created for each ladder step, screenshot checklist prepared.

### Evidence capture template
- For each cohort change, record:
	- Timestamp, command run, console output (trim secrets), config service response code.
	- Grafana screenshot (lookup p95/p99, alias miss, fallback) taken 5 minutes after apply.
	- `/ops cache` output in prod canary guild.
	- Any alerts or anomalies noted; if none, explicitly state "No alerts fired".
- Append the above under a dedicated `## 2025-11-05 DEX v2 Cutover` section in ops/change-ledger.md and cross-reference in Tasklist/Prompt summaries.
