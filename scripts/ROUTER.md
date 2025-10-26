# ROUTER
Title: Tooling
Purpose: Guard scripts and automation entrypoints.
Owned Globs: scripts/**
Last Updated (UTC): 2025-10-26T14:20:00Z

Notes:
- guard_meta.sh enforces READY invariants. Called in CI preflight/postflight.
- When POSTFLIGHT=1 it hard-fails on missing READY or NONE NEXT to keep merges safe.
- 2025-10-26: guard_meta detects the marker switch, relaxes contracts in Markerless Mode, and still enforces Absolutes.
