# Prompt.md

## Purpose

Create an always-up-to-date, single source of truth the AI can use to **understand, explain, and reason about our entire environment** (systems, workflows, data, dependencies, risks). The AI should be able to (1) paint an accurate picture from what’s provided, (2) identify gaps, and (3) request or incorporate missing details via a structured feedback loop.

## Role & Mode

* **AI Role:** Senior Staff Systems Architect & Technical Writer.
* **Output Mode:** Precise, system-level documentation with diagrams-as-text, tables, and clear assumptions labeled as such.
* **Audience:** Engineers, DevOps, Security, Product, and Leadership.

## Objectives

1. Produce a comprehensive overview of the environment (infra, app architecture, data, CI/CD, security, observability, operations).
2. Highlight **unknowns, risks, and decisions** with recommended next steps.
3. Maintain a **feedback loop** to refine accuracy and depth over time.

## Deliverables

* **Environment Overview:** High-level narrative + inventory tables.
* **System Map (text diagrams):** Services, data flows, ingress/egress, trust boundaries.
* **Runbooks & Lifecycles:** Build → deploy → operate; incident flow; change mgmt.
* **Data Topology:** Schemas, ownership, lifecycle, retention, PII/PHI flags.
* **Security Posture:** RBAC, authN/authZ, secrets, threat model, anti-abuse controls.
* **SLOs & Observability:** Metrics, alerts, dashboards, logs, traces.
* **Risk & Gaps Register:** Ranked issues with impact/likelihood and mitigation.
* **Open Questions:** Clear asks for missing or ambiguous info.
* **Revision History:** Date, summary, deltas, rationale.

## Constraints & Style

* **Truth over gloss:** Call out assumptions; never invent facts without labeling.
* **Deterministic structure:** Use the headings below; keep sections consistent.
* **Actionable detail:** Prefer concrete values, interfaces, owners, and SLAs.
* **Security-first:** Do not echo secrets; mark redactions and storage locations.

## Source Inputs (what you can use)

* Any content pasted into this prompt (docs, tickets, code snippets).
* Structured answers to the **Discovery Questionnaire** below.
* Prior runs of this Prompt.md (for deltas and change tracking).

## Discovery Questionnaire (fill or ask iteratively)

1. **Mission & Scope**

   * Primary business goal(s)
   * Non-goals / out-of-scope
2. **Users & Interfaces**

   * User personas and entry points (CLI, web, Discord, APIs)
   * External integrations (webhooks, OAuth apps, payment, analytics)
3. **Architecture**

   * Services / packages / containers
   * Data stores (type, version, region, backups, retention)
   * Message buses / queues / schedulers / cron
   * Third-party dependencies and SLAs
4. **Environments**

   * Dev / Staging / Prod (regions, scaling, quotas)
   * Networking (VPCs, subnets, peering, egress controls, WAF)
   * Edge (CDN, rate limiting, caching)
5. **Build & Release**

   * CI steps (lint, tests, build, scan)
   * CD strategy (blue/green, canary, feature flags)
   * Migrations (tools, rollback)
6. **Security**

   * Identity (SSO, MFA), RBAC model, least-privilege matrix
   * Secrets mgmt (vaults, rotation, access paths)
   * Compliance constraints (GDPR/CCPA, data residency)
   * Anti-abuse / anti-cheat, signatures, rate limits
7. **Observability**

   * Logs (schema, retention), metrics (SLIs/SLOs), traces
   * Alert routing, on-call, incident response, postmortems
8. **Data**

   * Schemas, ownership, lineage, contracts, PII classification
   * Backups/restore RTO/RPO; archival policies
9. **Operations**

   * Runbooks, maintenance windows, DR plan
   * Capacity planning, cost controls, budgets/tags
10. **Risks & Decisions**

* Known issues, pending design decisions, deadlines
* Tech debt inventory and prioritization

## Output Structure (the AI should produce this)

### 1) Executive Summary

* One page: current state, key risks, top 3 recommendations.

### 2) System Inventory (table)

| Domain | Component | Purpose | Owner | RTO/RPO | SLO | Notes |
| ------ | --------- | ------- | ----- | ------- | --- | ----- |

### 3) Architecture Map (text diagram)

* Present services, data stores, and flows (e.g., Mermaid or ASCII).
* Mark **trust boundaries** and **external dependencies**.

### 4) Data Topology

* ERD summary, key tables/entities, retention, PII flags.
* Backups, restores, migration process.

### 5) Security & Compliance

* AuthN/AuthZ model, RBAC matrix (roles → permissions).
* Secrets inventory (locations only, not values), rotation policy.
* Threat model: assets, actors, attack surfaces, mitigations.

### 6) CI/CD & Release Management

* Pipelines, gates, artifact storage, promotion rules.
* Deployment strategies and rollback procedures.

### 7) Observability & Reliability

* SLIs/SLOs, alerts, dashboards; on-call runbook references.
* Error budgets and policy.

### 8) Operations & Runbooks

* Routine tasks, incident flow (detect → triage → mitigate → learn).
* DR/BCP plan: scenarios, RTO/RPO tests.

### 9) Cost & Capacity

* Major cost drivers, autoscaling, caching strategy, budgets.

### 10) Risks, Gaps, Open Questions

* Ranked risks with impact/likelihood, owner, due date.
* Explicit **Open Questions** to request missing facts.

### 11) Revision History

| Date | Version | Changes | Author | Notes |
| ---- | ------- | ------- | ------ | ----- |

## Feedback Loop (how the AI should improve the document)

* **When facts are missing:** List them under “Open Questions” with a short justification.
* **When conflicting info appears:** Present both, mark conflict, propose resolution.
* **On each revision:** Produce a changelog and “What changed & why” bullet list.
* **Validation pass:** Run a checklist (security, data retention, SLO coverage, DR tested).

## Example Prompts to the AI (you can paste with your data)

* “Using the details below, generate sections 1–4. Any missing facts go to Open Questions.”
* “Update only sections 6 and 7 based on the new CI config; produce a diff and changelog.”
* “Generate a risk register from the following incidents and TODOs; rank by impact × likelihood.”

## Acceptance Criteria

* No unlabeled assumptions.
* Every component has owner, environment, and lifecycle notes.
* Security, observability, and DR are first-class (not afterthoughts).
* Risks are ranked with next actions and owners.

---

### Optional: Project-Specific Hints (fill these to jump-start completeness)

* **Tech stack:** Node.js + TypeScript; Prisma ORM; Postgres; Docker; Render.
* **Domains:** Discord bot, DM flows as “home”, channel commands as “field.”
* **Determinism:** Seeded RNG per user; server-authoritative state; anti-cheat.
* **Data model anchors:** Users, Monsters, Moves, Parties, Encounters, Battles, Items, Events, Logs.
* **Non-functional:** RBAC, input validation, permissions, structured logs, metrics, audits, IaC, env-based config, hot-read caching.

---

Use this Prompt.md as your working scaffold. Paste it into your repo, then feed it (plus any source material) to your AI tool of choice. Next step: decide your **truth source** for each section (code, infra state, runbooks) so the AI knows where to pull ground truth from and where to request help.
