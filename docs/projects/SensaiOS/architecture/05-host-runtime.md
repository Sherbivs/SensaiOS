# 05 — Host Runtime (Node Container Boots SensaiOS)

## Overview

This document defines the **Host Runtime** contract for SensaiOS: a Node.js process (often in a container) that boots the OS in a deterministic, observable way.

**Goal:** make SensaiOS usable as a reusable platform for future projects (not just Pokémon Infinity Gauntlet) by standardizing:
- boot order
- shutdown order
- component selection
- observability defaults
- database availability

## What “Host Runtime” Means

A **Host Runtime** is the thin process wrapper around SensaiOS.

It is responsible for:
- choosing a host kind (bot/worker/cron/cli)
- initializing the **root observer kernel** first
- creating/booting the SensaiOS kernel (component supervisor)
- wiring shutdown hooks and timeouts

It is explicitly *not* responsible for game logic, Discord adapters, or domain workflows. Those live in components.

## Canonical Boot Order

### Phase 0 — Root Observer Kernel (must be first import)

Infinity Gauntlet already follows a “kernel-first” pattern:
- root bootstrap: `src/kernel/boot-kernel.ts`
- main entry: `src/index.ts` imports boot-kernel first

**Invariant:** the root observer kernel must initialize before *any* other module loads.

### Phase 1 — SensaiOS Kernel Init (global instance)

SensaiOS exposes a global kernel instance API:
- `initKernel(config)`
- `bootKernel({ client }, components)`
- `shutdownKernel()`

Reference implementation: `src/sensaios/kernel-boot.ts`.

### Phase 2 — Components Register + Enable

Host chooses a component set based on:
- environment (development/staging/production)
- host kind (bot/worker/cron/cli)
- feature flags / configuration

Then it passes them to `bootKernel(...)`.

### Phase 3 — Runtime Ready

After kernel boot completes:
- host transitions to steady-state
- all stateful loops must be owned by components or workers

## Shutdown Contract

Host is responsible for graceful stop, using a strict order:
1. stop accepting new external inputs (Discord/HTTP)
2. disable components (reverse dependency order)
3. flush/close outbox, exports, and observability
4. disconnect database
5. allow root observer kernel to export final state

Reference: `shutdown()` in `src/sensaios/kernel-boot.ts`.

## Minimal Host Skeleton (Proposed)

This repository currently has the pieces, but does not yet have a dedicated “SensaiOS Host” entrypoint.

Proposed new entrypoint (example shape):
- `src/hosts/sensaios-host.ts` — boots root kernel + SensaiOS kernel + installs SIGTERM/SIGINT hooks

Responsibilities of that file:
- import `src/kernel/boot-kernel.ts` first
- load environment/config
- create Prisma client (or accept an injected client)
- call `initKernel({ name, tenantId, host })`
- call `bootKernel({ client: prisma }, components)`
- on shutdown: `shutdownKernel()` then `shutdownKernel()` (root observer)

## “Mobile Node Container” Interpretation

“Mobile” here means the runtime should stay:
- **pure Node** (no native-only assumptions)
- **low operational footprint** (single start command, minimal required env)
- **strict boot/shutdown discipline** (safe for volatile environments)

If a future mobile host cannot run Docker, the same Host Runtime contract still applies (it is just `node dist/...` with the same boot sequence).

## Next Steps

1. Add `src/hosts/sensaios-host.ts` and a `start:sensaios-host` script.
2. Define a minimal “core OS component set” (e.g., error routing, observability baseline, outbox).
3. Make the existing Discord bot host a SensaiOS component set instead of hand-wired service registry.
