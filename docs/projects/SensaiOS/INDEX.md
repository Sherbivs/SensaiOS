# SensaiOS Documentation Index

**Project:** SensaiOS Multi-Tenant Observability-First Architecture  
**Status:** PHASE 4 COMPLETE — Ring Security Implementation Done  
**Last Updated (UTC):** 2026-02-17T00:00:00Z  
**Total Documents:** 15 files (~7,200 lines) + 4 Bible integrations

---

## 🎉 Ring Security Implementation Complete

**Phase 4 (Visibility Enforcement) completed 2026-01-05:**
- ✅ SENSAI.VISIBILITY.DASHBOARD — TypeScript security dashboard
- ✅ SENSAI.VISIBILITY.LOADER — Module loader with ring enforcement
- ✅ SENSAI.VISIBILITY.TESTS — 202 security tests (4 files)
- ✅ SENSAI.VISIBILITY.DOCS — Bible documentation integration

**Documentation now in Bible system (AUTHORITATIVE):**
- [architecture-bible/28-sensaios-security-model.md](../../architecture-bible/28-sensaios-security-model.md)
- [development-bible/11-sensaios-development.md](../../development-bible/11-sensaios-development.md)
- [operations-bible/14-sensaios-operations.md](../../operations-bible/14-sensaios-operations.md)
- [playbooks/sensaios-security-incident.md](../../../playbooks/sensaios-security-incident.md)

---

## Quick Navigation

| I Need To... | Start Here |
|--------------|------------|
| **Understand SensaiOS** | [README.md](README.md) → [SENSAI-FINAL-ARCHITECTURE.md](SENSAI-FINAL-ARCHITECTURE.md) |
| **Implement a component** | [SENSAI-QUICK-REFERENCE.md](SENSAI-QUICK-REFERENCE.md) → [SENSAI-COMPONENT-OS-BLUEPRINT.md](SENSAI-COMPONENT-OS-BLUEPRINT.md) |
| **Start coding right now** | [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) → [architecture/01-tenant-scope.md](architecture/01-tenant-scope.md) |
| **Understand ring security** | [architecture/06-os-security-model.md](architecture/06-os-security-model.md) |
| **Know what's non-negotiable** | [SENSAI-FINAL-ARCHITECTURE.md § 15](SENSAI-FINAL-ARCHITECTURE.md#15-non-negotiables) |
| **Handle multi-tenancy** | [SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md](SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md) |
| **See the big picture vision** | [SENSAIOS-PERFECTED-VISION.md](SENSAIOS-PERFECTED-VISION.md) |
| **Understand gaps to perfection** | [SENSAIOS-PERFECTED-VISION.md § 5](SENSAIOS-PERFECTED-VISION.md#5-the-gap-map) |

---

## Document Hierarchy

### 📗 TIER 1: Canonical Reference (AUTHORITATIVE)

These documents define the truth. All other docs derive from these.

| Document | Purpose | Lines | Status |
|----------|---------|-------|--------|
| [**SENSAI-FINAL-ARCHITECTURE.md**](SENSAI-FINAL-ARCHITECTURE.md) | Master specification | 1,191 | ✅ CANONICAL |

**Reading Time:** ~45 minutes  
**Key Sections:**
- § 1: The Golden Invariant
- § 4: Kernel Primitives (9 primitives)
- § 5: Component Model
- § 15: Non-Negotiables (immutable rules)
- § 16: Implementation Checklist
- § 17: Migration Guide

---

### 📘 TIER 2: Architecture Specifications (Design Documents)

Detailed specifications for specific subsystems. All must align with FINAL-ARCHITECTURE.

| Document | Purpose | Lines | Status |
|----------|---------|-------|--------|
| [**architecture/01-tenant-scope.md**](architecture/01-tenant-scope.md) | Multi-tenant scope design | 389 | ✅ SPEC |
| [**architecture/02-export-envelope.md**](architecture/02-export-envelope.md) | Scoped envelope format | 548 | ✅ SPEC |
| [**architecture/03-error-detection.md**](architecture/03-error-detection.md) | Canonical error subsystem | 724 | ✅ SPEC |
| [**architecture/04-run-guarded.md**](architecture/04-run-guarded.md) | Kernel wrapper pattern | 699 | ✅ SPEC |
| [**architecture/05-host-runtime.md**](architecture/05-host-runtime.md) | Node container boot contract | ~150 | ✅ SPEC |
| [**architecture/06-os-security-model.md**](architecture/06-os-security-model.md) | Ring security & installation | 892 | ✅ SPEC |

**Total Architecture Lines:** ~3,400  
**Implementation Priority:** 01 → 02 → 03 → 04 → 06 → 05

---

### 📙 TIER 3: Supplementary Documentation (Guidance)

Extensions, addenda, and guidance documents that clarify edge cases.

| Document | Purpose | Lines | Status |
|----------|---------|-------|--------|
| [**SENSAI-COMPONENT-OS-BLUEPRINT.md**](SENSAI-COMPONENT-OS-BLUEPRINT.md) | Component model deep-dive | 909 | ✅ REFERENCE |
| [**SENSAI-ARCHITECTURE-ADDENDUM.md**](SENSAI-ARCHITECTURE-ADDENDUM.md) | Scalability & failure modes | 745 | ✅ ADDENDUM |
| [**SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md**](SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md) | v1.1.2 patterns | 707 | ✅ ADDENDUM |
| [**SENSAI-QUICK-REFERENCE.md**](SENSAI-QUICK-REFERENCE.md) | Cheat sheet | 260 | ✅ REFERENCE |
| [**SENSAIOS-PERFECTED-VISION.md**](SENSAIOS-PERFECTED-VISION.md) | Perfected vision, gap analysis, adoption requirements | ~710 | ✅ QA VERIFIED |

---

### 📓 TIER 4: Operational Documents (Working Docs)

Active planning and tracking documents.

| Document | Purpose | Status |
|----------|---------|--------|
| [**README.md**](README.md) | Project overview | ✅ CURRENT |
| [**ROUTER.md**](ROUTER.md) | Navigation router | ✅ CURRENT |
| [**IMPLEMENTATION-PLAN.md**](IMPLEMENTATION-PLAN.md) | Phased implementation | ✅ READY |

---

## Document Relationships

```
SENSAI-FINAL-ARCHITECTURE.md (CANONICAL SOURCE)
├── architecture/01-tenant-scope.md (implements § 9)
├── architecture/02-export-envelope.md (implements § 4.2)
├── architecture/03-error-detection.md (implements § 11)
├── architecture/04-run-guarded.md (implements § 12)
├── architecture/05-host-runtime.md (implements § 10.1)
├── architecture/06-os-security-model.md (NEW LAYER - Ring Security)
│
├── SENSAI-COMPONENT-OS-BLUEPRINT.md (expands § 5)
├── SENSAI-ARCHITECTURE-ADDENDUM.md (extends all)
├── SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md (formalizes v1.1.2)
│
├── SENSAI-QUICK-REFERENCE.md (summary card)
├── SENSAIOS-PERFECTED-VISION.md (strategic vision + gap map)
├── IMPLEMENTATION-PLAN.md (execution guide)
└── README.md (entry point)
```

---

## Version Matrix

| Concept | Document(s) | Version | Notes |
|---------|-------------|---------|-------|
| Core Architecture | FINAL-ARCHITECTURE | v1.1.2 | Canonical |
| TenantScope | 01-tenant-scope, MULTITENANT-ADDENDUM | v1.1.2 | Required on all envelopes |
| ExportEnvelope | 02-export-envelope | v1.0 | Extends UniversalEnvelope |
| CanonicalError | 03-error-detection | v1.1.2 | Typed error taxonomy |
| runGuarded | 04-run-guarded | v1.1.2 | All handlers wrapped |
| Host Runtime | 05-host-runtime | v1.0 | Boot discipline |
| Ring Security | 06-os-security-model | v1.0.0 | NEW - Phase 1 ready |
| Component Model | COMPONENT-OS-BLUEPRINT | v1.0 | Detailed component guide |

---

## Implementation Status

### ✅ Phase 4 Complete (Ring Security)

All 4 phases of SensaiOS Ring Security are now implemented:

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Ring Security Foundation | ✅ COMPLETE |
| Phase 2 | Installation Primitives | ✅ COMPLETE |
| Phase 3 | Game Server Boundary | ✅ COMPLETE |
| Phase 4 | Visibility Enforcement | ✅ COMPLETE |

### ✅ Implemented in Codebase

| Concept | Implementation | Lines |
|---------|----------------|-------|
| Kernel Boot | `src/kernel/boot-kernel.ts` | 731 |
| Component Supervisor | `src/sensaios/component-supervisor.ts` | 717 |
| Kernel Boot (SensaiOS) | `src/sensaios/kernel-boot.ts` | 486 |
| Security Dashboard | `src/sensaios/security-dashboard.ts` | ~500 |
| Module Loader | `src/sensaios/module-loader.ts` | ~400 |
| Security Tests | `tests/sensaios/security/` | 202 tests |
| Total sensaios/ | 20+ files | ~3,500 |

### 📋 Next Steps

SensaiOS Ring Security is complete. Next recommended work:
- Integrate capability system with production app registration
- Add runtime capability assertion to existing handlers
- Create app migration guide for existing components

---

## Recommended Reading Order

### For New Developers

1. **README.md** (5 min) — Get oriented
2. **SENSAI-QUICK-REFERENCE.md** (10 min) — See the patterns
3. **SENSAI-FINAL-ARCHITECTURE.md §1-5** (20 min) — Core concepts
4. **architecture/01-tenant-scope.md** (15 min) — Multi-tenancy
5. **IMPLEMENTATION-PLAN.md** (15 min) — What to build

### For Implementers

1. **SENSAI-FINAL-ARCHITECTURE.md** (45 min) — Full spec
2. **architecture/06-os-security-model.md** (30 min) — Security model
3. **SENSAI-COMPONENT-OS-BLUEPRINT.md** (30 min) — Component details
4. **architecture/04-run-guarded.md** (15 min) — Handler pattern

### For AI Agents

1. Read `.github/instructions/sensai.instructions.md` first
2. Reference **SENSAI-FINAL-ARCHITECTURE.md** for all decisions
3. Check **architecture/06-os-security-model.md** for security
4. Validate against **§ 15 Non-Negotiables** before implementing

---

## Document Maintenance Rules

### What Goes Where

| Content Type | Destination |
|--------------|-------------|
| Core architecture changes | SENSAI-FINAL-ARCHITECTURE.md |
| New subsystem spec | architecture/{NN}-{name}.md |
| Addendum/extension | SENSAI-{NAME}-ADDENDUM.md |
| Cheat sheet updates | SENSAI-QUICK-REFERENCE.md |
| Implementation changes | Update corresponding spec + IMPLEMENTATION-PLAN.md |

### Update Protocol

1. **Spec changes** require PR review
2. **FINAL-ARCHITECTURE.md** changes require DRIPTVDD approval
3. **All changes** must update Last Updated timestamps
4. **architecture/** changes must update INDEX.md version matrix

---

## Cross-References

### To Architecture Bible

When SensaiOS matures, these docs will migrate to `docs/architecture-bible/`:
- 06-os-security-model.md → architecture-bible/20-ring-security.md (planned)

### To Operations Bible

- Host runtime startup → operations-bible/03-worker-architecture.md
- Component lifecycle → operations-bible/XX-component-operations.md (planned)

### To Development Bible

- Implementation patterns → development-bible/XX-sensaios-patterns.md (planned)

---

## Glossary

| Term | Definition |
|------|------------|
| **Golden Invariant** | CLIENTS APPEND EXPORTS. WORKERS TRANSFORM EXPORTS. POSTGRES IS THE TRUTH. |
| **Ring 0** | Kernel layer — unrestricted database/observability access |
| **Ring 1** | SensaiOS layer — component management, capability enforcement |
| **Ring 3** | Applications — restricted to GameServerAPI |
| **TenantScope** | `{ tenantId, guildId }` — required on all envelopes |
| **runGuarded** | Kernel wrapper enforcing observability on all handlers |
| **Capability** | Explicit permission grant (db.read, discord.send, etc.) |
| **ExportEnvelope** | UniversalEnvelope + mandatory TenantScope |
| **ComponentContext** | Kernel primitives injected into component handlers |

---

**Created:** 2026-01-01  
**Purpose:** Unified navigation for SensaiOS documentation  
**Authority:** Project Leadership (DRIPTVDD)
