# Operations
- CI watchdog runs every 15 minutes; opens an Issue if stuck.
- All runs produce `runs/<ISO8601>/run.json` and `logs/agent-events.jsonl`.
- Post-incident: add a playbook entry; update AGENTS.md if behavior changes.

## DEX v2 Production Cutover (2025-11-05 02:00–03:00 ET)
- **Prereqs:** confirm prod/dev dumps archived under `backups/archive/2025-11-03/`, pack hash `f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00`, and flag plans in `ops/flag-plans/`.
- **Command cadence:**
	- `npm run ops:dex-v2-backup -- --env-file <Key/.../.env> --label <prod|dev>` (completed 2025-11-03T05:06Z, rerun only if drift detected).
	- `npm run ops:simulate-flag -- --flag DEX_V2_ENABLED --percent <1|25|50|100> --apply --config-url <prod config>`; omit `--dry-run` during the live window.
	- `npm run ops:dex-v2-alert-dry-run -- --webhook <override>` if the Ops channel webhook needs validation before announcements.
- **Communications:** circulate the #ops-release message (template in docs/dex-v2-design.md) at T-30 with Engineering/Ops/Security approval before sending.
- **Message snippets:** copy the "Pre-approved message" and "Follow-up" lines in docs/dex-v2-design.md §T-30 to avoid improvising during the window; update ops/change-ledger.md with the exact text posted.
- **Monitoring:** track Grafana `dex.metrics.lookup` p95/p99, Render alerts for `dex.verifier`, `/ops cache` for facade health, and Discord DM smoke checks in the canary guild.
- **Rollback trigger:** disable `DEX_V2_ENABLED` via config service if lookup p99 > 500 µs for >5 minutes, verifier fails pack signature, or canary error rate exceeds baseline by 2×.
- **Evidence:** store apply logs, webhook payloads, and monitoring screenshots in `ops/change-ledger.md` once the ladder completes; update Tasklist notes and Prompt PATCHSET echo with the outcome.
