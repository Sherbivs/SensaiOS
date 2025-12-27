# Section 8: Router System

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Security Bot](07-security-bot.md) | [Next: Game Engine →](09-game-engine.md)

---

**Philosophy**: "The router system is the map—not just of the codebase, but of the agent's understanding."

**Purpose**: Comprehensive navigation and recovery infrastructure for AI agents working in the codebase.

## 8.1 Meta-Router Design

**Router-of-Routers** — Centralized navigation system for AI agents to quickly locate subsystem documentation.

**Files**:
- `ops/ROUTER.yaml` — Router-of-routers manifest (primary entry point)
- `ops/ROUTER_INDEX.yaml` — Flat index of all subsystem routers
- `masterroutetable.md` — Human-readable router index with ownership and last-updated timestamps
- Every directory: `ROUTER.md` — Subsystem documentation (purpose, owned files, integration points)

**Navigation Flow**:

```
AI Agent → ops/ROUTER.yaml → Subsystem Router → Specific Files
```

**Example Lookup**:

```yaml
# ops/ROUTER.yaml
subsystems:
  - name: "Core Game Engine"
    router: "src/core/ROUTER.md"
    description: "Battle system, encounter spawning, PBSL framework"
  
  - name: "Discord Bot Layer"
    router: "src/bot/ROUTER.md"
    description: "Command handling, DM flows, interaction responses"
```

**Router Discipline**:
- Every code change MUST update routers in same commit
- Update parent `ROUTER.md` (e.g., `src/bot/ROUTER.md`)
- Update child `ROUTER.md` if creating new subdirectory
- Run `npm run docs:update-routers` to regenerate indexes
- CI guard `scripts/guard_routing.sh` blocks merges if routers outdated

## 8.2 Recovery Playbook

**Agent Stuckness Detection** — Automated detection and recovery when AI agents lose context.

**Stuckness Criteria**:
- No artifact/state change in 3 consecutive steps
- Same error string seen ≥2 times in 10 minutes
- Budget exceeded (time > 15m or tokens > threshold)

**Recovery Flow**:

```
Detect Stuckness → Shrink Scope → Swap Strategy → Reset Context → Escalate
```

**Playbook**: `playbooks/escalate.md`

## 8.3 Budgets

**Token Budget Management** — Automatic summarization at ~1M tokens.

**Current Pattern** (4 summarizations during this project):
1. First: Game Engine PBSL.md analysis (~53K tokens)
2. Second: Discord Bot file reading (~105K tokens)
3. Third: Bible reorganization preparation (~107K tokens)
4. Fourth: Content extraction (8 sections, 2,544 lines)

**Solution Effectiveness**: Proven — Agent resumes successfully after each summarization.

## 8.4 Coverage Map

**Router Coverage Tracking** — `ops/TOUCHMAP.yaml` documents which subsystems have active routers.

**Current Status**: 10 ROUTER.md files across major subsystems.

---

[← Back to INDEX](INDEX.md) | [← Previous: Security Bot](07-security-bot.md) | [Next: Game Engine →](09-game-engine.md)