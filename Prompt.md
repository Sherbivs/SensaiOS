# Prompt.md
Timestamp (UTC): 2025-10-25T00:50:00Z
Revision: 0.2

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `render.yaml` — added explicit `buildCommand` (npm ci && npm run build) and `startCommand` (node dist/index.js) to fix Render “Missing script: start”.
> - `src/bot/`, `src/core/battle/`, `src/core/encounter/`, `src/shared/`, `src/data_pipeline/`, `tests/` — created scaffold entries to establish project layout.
> - `RULESET.md`, `DATA-SCHEMA.md`, `OPERATIONS.md` — added stub docs with UTC placeholders.
> - `ops/NEXT.yaml` — advanced `next_task_id` to `T1.1` (DB schema) and updated `files_hint`.
> - `Tasklist.md` — marked `T0.2` DONE; added fix task for Render start.

## Purpose
Create an always-up-to-date, single source of truth the AI can use to **understand, explain, and reason about our entire environment** (systems, workflows, data, dependencies, risks). The AI should be able to (1) paint an accurate picture from what’s provided, (2) identify gaps, and (3) request or incorporate missing details via a structured feedback loop.

## Role & Mode
- **AI Role:** Senior Staff Systems Architect & Technical Writer.
- **Output Mode:** Precise, system-level documentation with diagrams-as-text, tables, and clear assumptions labeled as such.
- **Audience:** Engineers, DevOps, Security, Product, and Leadership.

## Objectives
1. Produce a comprehensive overview of the environment (infra, app architecture, data, CI/CD, security, observability, operations).
2. Highlight **unknowns, risks, and decisions** with recommended next steps.
3. Maintain a **feedback loop** to refine accuracy and depth over time.

---

## Ground Truth Sources (authoritative inputs)
Use these in order unless a section specifies otherwise:
1. `ops/NEXT.yaml` — current next task & file hints.
2. `Tasklist.md` — authoritative task graph and statuses.
3. `ops/TOUCHMAP.yaml` — file paths likely to be touched for a task.
4. `ops/KNOWLEDGE.yaml` — knowledge map (where truth for each domain lives).
5. Source code under the mapped paths (read, don’t assume).
6. Prior `Prompt.md` revisions (for deltas and change tracking).
7. Any explicitly provided artifacts (docs, tickets, pasted snippets).

> If sources conflict, record the conflict in **Section 10: Risks, Gaps, Open Questions**, cite both sources in the Evidence Matrix, and propose a resolution.

---

## Deliverables
- **Environment Overview:** High-level narrative + inventory tables.
- **System Map (text diagrams):** Services, data flows, ingress/egress, trust boundaries.
- **Runbooks & Lifecycles:** Build → deploy → operate; incident flow; change mgmt.
- **Data Topology:** Schemas, ownership, lifecycle, retention, PII/PHI flags.
- **Security Posture:** RBAC, authN/authZ, secrets, threat model, anti-abuse controls.
- **SLOs & Observability:** Metrics, alerts, dashboards, logs, traces.
- **Risk & Gaps Register:** Ranked issues with impact/likelihood and mitigation.
- **Open Questions:** Clear asks for missing or ambiguous info.
- **Revision History:** Date, summary, deltas, rationale.

---

## Constraints & Style
- **Truth over gloss:** Call out assumptions; never invent facts without labeling.
- **Deterministic structure:** Use the headings below; keep sections consistent.
- **Actionable detail:** Prefer concrete values, interfaces, owners, and SLAs.
- **Security-first:** Do not echo secrets; mark redactions and storage locations.

---

## Discovery Questionnaire (fill or ask iteratively)
1. **Mission & Scope**: goals; non-goals.
2. **Users & Interfaces**: personas; entry points (DMs, channels, Discord slash commands); external integrations.
3. **Architecture**: services/packages/containers; data stores (type, version, region, backups, retention); messaging/cron; third-party deps & SLAs.
4. **Environments**: dev/staging/prod; networking; edge; quotas/limits.
5. **Build & Release**: CI steps; CD strategy; migrations & rollback.
6. **Security**: identity, RBAC, secrets mgmt, compliance, anti-abuse.
7. **Observability**: logs/metrics/traces; alert routing; incident response.
8. **Data**: schemas, lineage, contracts, PII classification, RTO/RPO.
9. **Operations**: runbooks, maintenance windows, DR; cost controls.
10. **Risks & Decisions**: known issues, deadlines, tech debt.

---

## Output Structure (generate or update these sections)

### 1) Executive Summary
- One page: current state, key risks, top 3 recommendations.

### 2) System Inventory (table)
| Domain | Component | Purpose | Owner | RTO/RPO | SLO | Notes |
| ------ | --------- | ------- | ----- | ------- | --- | ----- |

### 3) Architecture Map (text diagram)
- Present services, data stores, and flows (Mermaid or ASCII).
- Mark **trust boundaries** and **external dependencies**.
- **Diagram conventions**:
  - Services: `[svc]`
  - Data stores: `(db)`
  - External: `{ext}`
  - Trust boundary: `=== boundary ===`
  - Example (Mermaid):
    ```
    flowchart LR
      user[[Discord User]] -->|slash command| bot[Discord Bot]
      bot --> core[Core Battle Engine]
      bot --> wilds[Encounter Engine]
      core --> db[(Postgres)]
      wilds --> db
      bot -->{Discord API}
    ```

### 4) Data Topology
- ERD summary, key entities (Users, Monsters, Moves, Parties, Encounters, Battles, Items, Events, Logs), retention, PII flags.
- Backups, restores, migration process.

### 5) Security & Compliance
- AuthN/AuthZ model, RBAC matrix (roles → permissions).
- Secrets inventory (locations only, not values), rotation policy.
- Threat model: assets, actors, surfaces, mitigations.

### 6) CI/CD & Release Management
- Pipelines, gates, artifact storage, promotion rules.
- Deployment strategies and rollback procedures.

### 7) Observability & Reliability
- SLIs/SLOs, alerts, dashboards; on-call runbook references.
- Error budgets and policy.

### 8) Operations & Runbooks
- Routine tasks, incident flow (detect → triage → mitigate → learn).
- DR/BCP plan: scenarios, RTO/RPO tests.

### 9) Cost & Capacity
- Major cost drivers, autoscaling, caching strategy, budgets.

### 10) Risks, Gaps, Open Questions
- Ranked risks with impact×likelihood, owner, due date.
- Explicit **Open Questions** to request missing facts.

### 11) Revision History
| Date | Version | Changes | Author | Notes |
| ---- | ------- | ------- | ------ | ----- |
| 2025-10-25 | 0.2 | Stamped docs; added render.yaml; scaffolded dirs; advanced NEXT to T1.1; updated Tasklist | AI | Aligns with Render deploy logs (start script fix) |

---

## Evidence Matrix (traceability)
Record where each claim came from. Keep it short and link to files/lines when possible.

| Section | Claim | Source (file:path#lines) | Confidence | Notes |
| ------- | ----- | ------------------------ | ---------- | ----- |
| Arch    | Bot runs on Render Web Service | ops/KNOWLEDGE.yaml:infra | High | Confirmed in Render config once present |

> Update this table when you add or change facts. If multiple sources disagree, list them all and mark the conflict.

---

## Assumptions & TBD Register
Track assumptions separately from facts. Replace assumptions with facts as we learn them.

| ID | Area | Assumption/TBD | Rationale | Replacement Plan | Status |
| -- | ---- | -------------- | --------- | ---------------- | ------ |
| A-001 | Infra | Using Render Postgres | MVP simplicity | Confirm Render DB provisioned | OPEN |

---

## Validation Checklist (run each revision)
- [ ] No unlabeled assumptions remain in core sections (1–7).
- [ ] Secrets are not echoed; locations/redactions noted.
- [ ] All diagrams reflect current service boundaries and stores.
- [ ] SLOs/RTO-RPO specified or listed as TBD with owners.
- [ ] Evidence Matrix updated for new/changed claims.
- [ ] Revision History updated with date/version and deltas.
- [ ] `ops/NEXT.yaml` pointer still aligned with Tasklist.

---

## Feedback Loop (how to improve this document)
- When facts are missing: list them in **Section 10** with justification.
- When conflicting info appears: present both, mark conflict, propose resolution.
- On each revision: produce a changelog and “What changed & why” list in **Revision History**.
- Validation pass: run the checklist above.

---

## Example Prompts (use with your data)
- “Using the details below, generate sections 1–4. Any missing facts go to Open Questions.”
- “Update only sections 6 and 7 based on the new CI config; produce a diff and changelog.”
- “Generate a risk register from the following incidents and TODOs; rank by impact×likelihood.”

---

## Acceptance Criteria
- No unlabeled assumptions.
- Every component has owner, environment, and lifecycle notes.
- Security, observability, and DR are first-class (not afterthoughts).
- Risks are ranked with next actions and owners.

---

### Optional: Project-Specific Hints
- **Tech stack:** Node.js + TypeScript; Prisma ORM; Postgres; Docker; Render.
- **Domains:** Discord bot, DM flows as “home”, channel commands as “field.”
- **Determinism:** Seeded RNG per user; server-authoritative state; anti-cheat.
- **Data model anchors:** Users, Monsters, Moves, Parties, Encounters, Battles, Items, Events, Logs.
- **Non-functional:** RBAC, input validation, permissions, structured logs, metrics, audits, IaC, env-based config, hot-read caching.
**Commit Message**
```

[Task T0.TIMESTAMPS] Add timestamp/revision headers and “Last Repo Changes” discipline

Why:
AIs need deterministic temporal context and a concise delta summary to reason about repo state and iterate safely.

Changes:

* Patch.md/Tasklist.md: added top-of-file Last Updated (UTC) and Revision placeholders; documented timestamp policy.
* Prompt.md: added Timestamp/Revision header and mandatory “Last Repo Changes” block; noted policy in Ground Truth section.
* ops/CRITICAL.md: reinforced timestamp/change-log requirements.
* ops/TOUCHMAP.yaml: mapped new maintenance task.

Acceptance:
Headers present; policies documented; touch map and task list updated with T0.TIMESTAMPS = DONE.

```
```
