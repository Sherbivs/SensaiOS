# Architecture
- **Meta-router** orchestrates Planner → Researcher → Implementer → Reviewer loops.
- **Agents** are pure functions: input Task → output StepResult; keep side effects behind tools.
- **Observability**: JSONL event log + OpenTelemetry traces for router and tools.
- **State**: Working memory (ephemeral), Artifacts (files, PRs), Ledger (run.json).
