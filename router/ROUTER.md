# ROUTER
Title: Meta Router Implementation
Purpose: TypeScript routing engine that delegates tasks to specialist agents.
Owned Globs: router/**
Last Updated (UTC): 2025-10-30T00:46:00Z

Notes:
- `metaRouter.ts` exposes the event-driven router used by automation to assign planner/researcher/implementer/reviewer roles.
- Recovery loop mirrors the handbook (shrink step → swap strategy → reset), emitting JSONL audit events for observability.
- Registry wiring expects agent executors with consistent `StepResult` payloads; extend this module when new agent roles land.

Key Files:
- metaRouter.ts - Router implementation and recovery heuristics.
