# Operations
- CI watchdog runs every 15 minutes; opens an Issue if stuck.
- All runs produce `runs/<ISO8601>/run.json` and `logs/agent-events.jsonl`.
- Post-incident: add a playbook entry; update AGENTS.md if behavior changes.
