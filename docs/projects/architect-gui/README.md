# Infinity-G-Architect — Architecture GUI Editor

> **Project Status:** 📋 PLANNING  
> **Priority:** LOW (deferred until Phase 17-18 complete)  
> **Lead Specialist:** Architecture  
> **Created:** 2025-12-03  
> **Target Start:** After ARCHITECTURE.HOMESTEAD_CHANNELS.DEPLOYMENT complete

---

## Executive Summary

**Infinity-G-Architect** is a visual GUI tool for editing, visualizing, and managing the Pokémon Infinity Gauntlet application architecture. It provides a graphical interface that:

1. **Visualizes** system architecture (services, databases, workers, channels)
2. **Allows editing** configuration, code structure, and system topology
3. **Syncs changes** back to the main repository and pushes to GitHub

This tool will accelerate development by providing visual feedback, reducing context-switching, and enabling non-code-heavy architecture changes through a drag-and-drop interface.

---

## Specialist Team Assembly

### 🎯 Core Team (Required for All Phases)

| Specialist | Role | Primary Responsibilities |
|------------|------|--------------------------|
| **Architecture** (Lead) | System design, integration patterns | Overall design, service topology, data flow |
| **AI Coding** | Implementation, code quality | React/Node.js development, Git integration |
| **Documentation** | User guides, API docs | README, user manual, architecture docs |

### 🔧 Domain Specialists (As Needed)

| Specialist | Role | When Needed |
|------------|------|-------------|
| **Database** | Schema visualization | Phase 2 (Prisma schema editor) |
| **DevOps** | Deployment, CI/CD | Phase 3 (GitHub Actions, deployment) |
| **Security** | Auth, secrets management | Phase 3 (GitHub OAuth, token handling) |
| **Testing** | Test coverage, E2E | Phase 4 (comprehensive testing) |
| **Performance** | Optimization | Phase 5 (large repo handling) |

---

## Current Work Dependencies

### ⚠️ Blocking Work (Must Complete First)

| Task ID | Title | Status | Est. Completion |
|---------|-------|--------|-----------------|
| DB.NORTHSTAR.ANALYTICS | Analytics event tables | READY | 1-2 weeks |
| DB.NORTHSTAR.SERVICES | EventTracker + ProfileService | IN_PROGRESS | 1 week |
| ARCHITECTURE.HOMESTEAD_CHANNELS.* | Private channel architecture (6 tasks) | READY → PROPOSED | 3-4 weeks |

### 📊 Estimated Start Date

Based on current backlog:
- **Optimistic:** 2025-01-15 (if homestead migration completes on schedule)
- **Realistic:** 2025-02-01 (accounting for testing and stabilization)
- **Conservative:** 2025-02-15 (if deployment issues arise)

---

## Technical Specification

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Infinity-G-Architect                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   React     │    │   Node.js   │    │   Git CLI   │        │
│  │  Frontend   │◄──►│   Backend   │◄──►│  (simple-   │        │
│  │             │    │             │    │    git)     │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│        │                  │                   │                │
│        ▼                  ▼                   ▼                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  React Flow │    │   Parsers   │    │  GitHub     │        │
│  │  (diagrams) │    │ (YAML/JSON/ │    │    API      │        │
│  │             │    │   Prisma)   │    │             │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     Infinity-Gauntlet Repo    │
              │  (local clone + remote sync)  │
              └───────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React 18 + TypeScript | Component reuse, type safety, ecosystem |
| **Diagrams** | React Flow | Best-in-class node-based editor |
| **Code Editor** | Monaco Editor | VS Code engine, syntax highlighting |
| **UI Components** | shadcn/ui + Tailwind | Modern, accessible, customizable |
| **Backend** | Node.js + Express | Simple, familiar, easy Git integration |
| **Git Operations** | simple-git | Mature, well-documented library |
| **File Parsing** | Custom parsers | render.yaml, schema.prisma, package.json |
| **State Management** | Zustand | Lightweight, TypeScript-friendly |
| **Desktop (Optional)** | Electron | Cross-platform desktop app |

### Repository Structure

```
Infinity-G-Architect/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # File explorer
│   │   │   ├── Toolbar.tsx         # Actions bar
│   │   │   └── StatusBar.tsx       # Git status, sync info
│   │   │
│   │   ├── diagram/
│   │   │   ├── ArchitectureDiagram.tsx    # Main canvas
│   │   │   ├── nodes/
│   │   │   │   ├── ServiceNode.tsx        # Render service
│   │   │   │   ├── DatabaseNode.tsx       # PostgreSQL
│   │   │   │   ├── WorkerNode.tsx         # Background worker
│   │   │   │   └── ChannelNode.tsx        # Discord channel
│   │   │   └── edges/
│   │   │       └── ConnectionEdge.tsx     # Service connections
│   │   │
│   │   ├── editors/
│   │   │   ├── ServiceEditor.tsx          # Edit service config
│   │   │   ├── SchemaEditor.tsx           # Prisma schema GUI
│   │   │   ├── EnvEditor.tsx              # Environment variables
│   │   │   └── CodeEditor.tsx             # Monaco wrapper
│   │   │
│   │   └── git/
│   │       ├── GitPanel.tsx               # Commit/push UI
│   │       ├── DiffViewer.tsx             # Show changes
│   │       └── BranchSelector.tsx         # Branch management
│   │
│   ├── services/
│   │   ├── git.service.ts                 # Git operations
│   │   ├── file.service.ts                # File read/write
│   │   ├── parser.service.ts              # YAML/JSON/Prisma parsing
│   │   └── github.service.ts              # GitHub API integration
│   │
│   ├── stores/
│   │   ├── project.store.ts               # Project state
│   │   ├── diagram.store.ts               # Diagram state
│   │   └── git.store.ts                   # Git state
│   │
│   └── types/
│       ├── project.types.ts
│       ├── diagram.types.ts
│       └── git.types.ts
│
├── server/                                # Optional backend
│   ├── index.ts
│   ├── routes/
│   │   ├── git.routes.ts
│   │   ├── file.routes.ts
│   │   └── github.routes.ts
│   └── services/
│       ├── git.service.ts
│       └── file.service.ts
│
├── electron/                              # Optional desktop
│   ├── main.ts
│   └── preload.ts
│
└── docs/
    ├── USER-GUIDE.md
    ├── DEVELOPMENT.md
    └── API.md
```

---

## Phased Implementation Plan

### Phase 1: Foundation (2 weeks)

**Goal:** Basic app scaffold with architecture visualization

**Deliverables:**
- [ ] Project setup (Vite + React + TypeScript)
- [ ] Basic layout (sidebar, canvas, toolbar)
- [ ] Parse `render.yaml` → service nodes
- [ ] Parse `package.json` → project metadata
- [ ] Static architecture diagram (read-only)
- [ ] File explorer (read-only tree view)

**Acceptance Criteria:**
- App launches and displays Infinity-Gauntlet architecture
- Services shown as draggable nodes with connections
- Clicking node shows service details in panel

**Specialist Signoffs Required:**
- [ ] Architecture: Design approved
- [ ] AI Coding: Code quality verified
- [ ] Documentation: README complete

---

### Phase 2: Editing Capabilities (3 weeks)

**Goal:** Enable editing of configuration files through GUI

**Deliverables:**
- [ ] Service editor (edit render.yaml services)
- [ ] Environment variable editor
- [ ] Prisma schema visualizer (tables as nodes)
- [ ] Monaco code editor integration
- [ ] Change tracking (unsaved changes indicator)
- [ ] File save functionality

**Acceptance Criteria:**
- Can edit service configuration through GUI
- Can edit environment variables
- Can view Prisma schema as visual diagram
- Changes saved to local files

**Specialist Signoffs Required:**
- [ ] Architecture: Data flow approved
- [ ] Database: Schema parser validated
- [ ] AI Coding: Edit logic verified
- [ ] Documentation: Editor docs complete

---

### Phase 3: Git Integration (2 weeks)

**Goal:** Full Git workflow within the app

**Deliverables:**
- [ ] Git status display (changed files, branch)
- [ ] Diff viewer for changes
- [ ] Stage/unstage files
- [ ] Commit with message
- [ ] Push to remote
- [ ] Pull from remote
- [ ] Branch creation/switching
- [ ] GitHub OAuth authentication

**Acceptance Criteria:**
- Can view all Git changes in app
- Can commit and push without leaving app
- GitHub authentication works securely

**Specialist Signoffs Required:**
- [ ] Architecture: Git flow approved
- [ ] Security: Auth implementation reviewed
- [ ] DevOps: CI/CD integration verified
- [ ] AI Coding: Git operations tested

---

### Phase 4: Advanced Features (3 weeks)

**Goal:** Power-user features and polish

**Deliverables:**
- [ ] Deployment trigger (one-click Render deploy)
- [ ] Log viewer (stream Render logs)
- [ ] Database browser (query builder, data viewer)
- [ ] Battle simulator (visual PBSL testing)
- [ ] Encounter designer (spawn table editor)
- [ ] Worker health dashboard
- [ ] Keyboard shortcuts
- [ ] Theme support (light/dark)

**Acceptance Criteria:**
- Can trigger Render deployment from app
- Can view live logs
- Can query database and view results
- All major features accessible via keyboard

**Specialist Signoffs Required:**
- [ ] Architecture: Feature integration approved
- [ ] Performance: Large dataset handling verified
- [ ] Testing: E2E tests passing
- [ ] Documentation: User guide complete

---

### Phase 5: Desktop App (Optional) (2 weeks)

**Goal:** Standalone desktop application via Electron

**Deliverables:**
- [ ] Electron wrapper
- [ ] Native file system access
- [ ] System tray integration
- [ ] Auto-update mechanism
- [ ] Cross-platform builds (Windows, macOS, Linux)
- [ ] Installer packages

**Acceptance Criteria:**
- App installs and runs natively on all platforms
- Auto-updates work reliably
- Performance matches web version

**Specialist Signoffs Required:**
- [ ] DevOps: Build pipeline verified
- [ ] Testing: Platform testing complete
- [ ] Documentation: Installation guide complete

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | HIGH | MEDIUM | Strict phase gates, MVP focus |
| Git operation complexity | MEDIUM | HIGH | Use battle-tested simple-git library |
| Parser edge cases | MEDIUM | MEDIUM | Comprehensive test suite for parsers |
| Performance with large repos | LOW | HIGH | Lazy loading, virtualization |
| Security (token handling) | LOW | CRITICAL | Secure storage, short-lived tokens |
| Electron complexity | MEDIUM | LOW | Keep as optional phase |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to visualize architecture | < 5 seconds | Stopwatch from app launch |
| Successful Git operations | > 99% | Error rate tracking |
| User adoption | 100% (solo dev) | Self-use validation |
| Bugs per phase | < 5 critical | Issue tracking |
| Code coverage | > 80% | Jest coverage report |

---

## Open Questions

1. **Browser vs Desktop?** — Start browser-only, add Electron later?
2. **Multi-repo support?** — Just Infinity-Gauntlet, or configurable?
3. **Real-time collaboration?** — Future feature or out of scope?
4. **Mobile companion?** — Integrate with Infinity-G-App?
5. **Plugin system?** — Allow custom nodes/editors?

---

## References

- [React Flow Documentation](https://reactflow.dev/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [simple-git](https://github.com/steveukx/git-js)
- [shadcn/ui](https://ui.shadcn.com/)
- [Electron](https://www.electronjs.org/)

---

## Appendix: Current Architecture (For Reference)

### Render Services (from render.yaml)

| Service | Type | Description |
|---------|------|-------------|
| infinity-gauntlet-bot | web | HTTP health checks |
| Infinity-Gauntlet | worker | Main Discord bot |
| infinity-gauntlet-outbox | worker | Async message delivery |
| infinity-gauntlet-cache | worker | Runtime cache |
| infinity-gauntlet-data-pipeline | worker | Reference data |
| infinity-gauntlet-security | worker | Permission guardrails |
| pokedex-cache-worker | worker | External data sync |
| pokedex-cache-failsafe | cron | Weekly fallback |

### Database Architecture

| Database | Env Var | Purpose |
|----------|---------|---------|
| CLOUD-PROD-MASTER | PROD_DATABASE_URL | Production |
| ONPREMISE-DEV-PRIMARY | DATABASE_ONPREMISE_DEV_PRIMARY | Development |
| ONPREMISE-DEV-EXPERIMENT | DATABASE_ONPREMISE_DEV_EXPERIMENT | Migration testing |

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-03T00:00:00Z  
**Next Review:** When Phase 17-18 completes
