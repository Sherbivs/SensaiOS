# ROUTER
Title: SensaiOS Multi-Tenant Observability Layer
Purpose: Multi-tenant observability-first architecture with scoped envelopes, guarded execution, kernel primitives, component lifecycle, and event dispatching
Owned Globs: src/sensaios/**
Last Updated (UTC): 2026-01-04T00:00:00Z

Notes:
- Phase 1 COMPLETE: TenantScope, ExportEnvelope implemented
- Phase 2 COMPLETE: CanonicalError, ErrorRouter, ErrorTracker implemented
- Phase 3 COMPLETE: runGuarded, decorators, convenience helpers implemented
- Phase 4 COMPLETE: ComponentContext, kernel primitives, context factory implemented
- Phase 5 COMPLETE: ComponentRegistry, ComponentSupervisor, lifecycle management implemented
- Phase 6 COMPLETE: BootLogger, KernelBoot, Event Dispatchers implemented
- Phase 7 IN PROGRESS: Ring Security with visibility enforcement via ESM loader hooks
- Extends existing kernel/observability systems, does not replace them
- Uses AsyncLocalStorage for scope propagation (same pattern as kernel/correlation.ts)
- Documentation in docs/projects/SensaiOS/

Areas:
- index.ts — Barrel exports for all SensaiOS modules (Phases 1-6)
- types.ts — Shared type definitions (ErrorCategory, ExportMeta, GuardedContext, GuardedResult)
- tenant-scope.ts — TenantScope type + context propagation utilities
- export-envelope.ts — ExportEnvelope type + factory functions + serializers
- canonical-error.ts — CanonicalError type + category detection + fingerprinting
- error-routing.ts — Severity-based routing to destinations (console, Discord, pager)
- error-tracker.ts — Deduplication, pattern detection, burst/trending analysis
- run-guarded.ts — Handler wrapper with correlation ID, scope, timing, error capture
- guarded-decorator.ts — @guarded, @guardedClass, @guardedProperty decorators
- component-context.ts — ComponentContext interface + all kernel primitive types (Phase 4)
- context-factory.ts — Context creation factory + stub implementations for primitives (Phase 4)
- component-registry.ts — Component state machine + validation + dependency graph (Phase 5)
- component-supervisor.ts — Lifecycle orchestration + handler registration + boot/shutdown (Phase 5)
- boot-logger.ts — Observability-first boot logging (starts before DB connection) (Phase 6)
- kernel-boot.ts — Orchestrates kernel initialization sequence (Phase 6)
- dispatchers.ts — Routes events to registered handlers via supervisor (Phase 6)

Kernel Primitives (Phase 4):
- DbPrimitive — Database access with transaction support
- ExportsPrimitive — Append-only event log for component communication
- JobsPrimitive — Background job queue with retry semantics
- OutboxPrimitive — External message delivery (Discord, webhook)
- ConfigPrimitive — Configuration and feature flags
- RbacPrimitive — Role-based access control with audit logging
- ObsPrimitive — Scoped logging and metrics
- RngPrimitive — Deterministic RNG for game mechanics (Mulberry32)
- StoragePrimitive — Database-backed blob/object storage

Context Factory Functions:
- createComponentContext() — Full context with all primitives
- createTestContext() — Pre-configured test context with stubs
- contextFromInteraction() — Discord interaction handler context
- contextFromWorker() — Background worker context
- contextFromGuild() — Guild-scoped context
- systemContext() — System-level operations context
- contextFromCli() — CLI command context

Component Registry (Phase 5):
- ComponentRegistry class — Component state machine (uninstalled → installed → enabled)
- install() — Install component with manifest validation
- uninstall() — Remove disabled component from registry
- enable() — Enable component with lifecycle hooks (onLoad, onEnable)
- disable() — Disable component with lifecycle hooks (onDisable, onUnload)
- validate() — Manifest validation (name, version, hosts, capabilities, dependencies)
- getInDependencyOrder() — Topological sort for boot sequence
- detectCircularDependencies() — Cycle detection in dependency graph
- componentRegistry singleton — Shared registry instance

Component Supervisor (Phase 5):
- ComponentSupervisor class — Lifecycle orchestration and handler dispatch
- register() — Install component via registry with validation
- boot() — Enable all components in dependency order, register handlers
- shutdown() — Disable components in reverse order, clear handlers
- getDiscordHandler() — Lookup Discord handler by name
- getExportHandler() — Lookup export handler by type
- getJobHandler() — Lookup job handler by kind
- getHttpHandler() — Lookup HTTP handler by path
- getCliHandler() — Lookup CLI handler by command
- supervisor singleton — Shared supervisor instance

Handler Types:
- DiscordHandler — Discord command/button/select interactions
- ExportHandler — Export event consumers
- JobHandler — Background job processors
- HttpHandler — HTTP request handlers
- CliHandler — CLI command handlers

Boot Logger (Phase 6):
- createBootLogger() — Create logger before database connects
- createBootStatus() — Initialize boot phase tracking
- completeBootPhase() — Mark phase complete with duration
- failBoot() — Record boot failure with error details
- clearBootLogger() — Cleanup after boot completes
- BootPhase enum — PRE_DB, DB_CONNECT, SCHEMA_VERIFY, KERNEL_INIT, COMPONENTS, HANDLERS, COMPLETE
- BootStatus — Tracks phase progress, timings, and errors

Kernel Boot (Phase 6):
- bootKernel() — Orchestrates full kernel initialization sequence
- KernelConfig — Database URL, host type, component manifests, shutdown timeout
- SensaiKernel — Running kernel with supervisor, registry, shutdown function
- SensaiKernelStatus — Health check with uptime, components, handlers stats
- Boot sequence: PRE_DB → DB_CONNECT → SCHEMA_VERIFY → KERNEL_INIT → COMPONENTS → HANDLERS → COMPLETE
- Graceful shutdown with configurable timeout (default 30s)

Event Dispatchers (Phase 6):
- createDiscordDispatcher() — Routes interactions to handlers by command/custom ID
- createExportDispatcher() — Routes exports to handlers by event type
- createJobDispatcher() — Routes jobs to handlers by kind with retry support
- createHttpDispatcher() — Routes HTTP requests to handlers by path
- createCliDispatcher() — Routes CLI commands to handlers
- All dispatchers use runGuarded for observability and error capture
- All dispatchers create ComponentContext for handler execution

Module Loader Security (Phase 7):
- loader/module-hook.ts — ESM loader hooks (resolve, load) for ring enforcement
- loader/ring-resolver.ts — Path analysis and ring level detection with caching
- loader/index.ts — Barrel exports for loader module
- loader/ROUTER.md — Module loader documentation
- Usage: `node --loader ./dist/sensaios/loader/module-hook.js src/index.js`
- Environment: SENSAIOS_LOADER_DISABLED, SENSAIOS_LOADER_VERBOSE

Integration Points:
- kernel/correlation.ts — Uses same AsyncLocalStorage pattern
- kernel/kernel-error-detector.ts — Reuses fingerprinting patterns
- observability/envelope/types.ts — ExportEnvelope extends UniversalEnvelope
- shared/event-bus.ts — Error events for routing
- shared/prisma.ts — DbPrimitive wraps existing Prisma clients
- observability/envelope/console.ts — ObsPrimitive uses scopedLogger
- Component lifecycle hooks receive ComponentContext for primitive access
