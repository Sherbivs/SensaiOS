# ROUTER
Title: SensaiOS Multi-Tenant Observability Layer
Purpose: Multi-tenant observability-first architecture with scoped envelopes and guarded execution
Owned Globs: src/sensaios/**
Last Updated (UTC): 2025-12-29T01:15:00Z

Notes:
- Phase 1 COMPLETE: TenantScope, ExportEnvelope implemented
- Phase 2 COMPLETE: CanonicalError, ErrorRouter, ErrorTracker implemented
- Extends existing kernel/observability systems, does not replace them
- Uses AsyncLocalStorage for scope propagation (same pattern as kernel/correlation.ts)
- Documentation in docs/projects/SensaiOS/

Areas:
- index.ts — Barrel exports for all SensaiOS modules
- types.ts — Shared type definitions (ErrorCategory, ExportMeta, etc.)
- tenant-scope.ts — TenantScope type + context propagation utilities
- export-envelope.ts — ExportEnvelope type + factory functions + serializers
- canonical-error.ts — CanonicalError type + category detection + fingerprinting
- error-routing.ts — Severity-based routing to destinations (console, Discord, pager)
- error-tracker.ts — Deduplication, pattern detection, burst/trending analysis

Pending (Phase 3):
- run-guarded.ts — Handler wrapper function (Phase 3)
- guarded-decorator.ts — Optional decorator pattern (Phase 3)

Integration Points:
- kernel/correlation.ts — Uses same AsyncLocalStorage pattern
- kernel/kernel-error-detector.ts — Reuses fingerprinting patterns
- observability/envelope/types.ts — ExportEnvelope extends UniversalEnvelope
- shared/event-bus.ts — Error events (Phase 2)
