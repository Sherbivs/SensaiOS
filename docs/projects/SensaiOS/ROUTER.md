# ROUTER
Title: SensaiOS Multi-Tenant Architecture
Purpose: Multi-tenant observability-first operating layer with scoped envelopes and guarded execution
Owned Globs: docs/projects/SensaiOS/**
Last Updated (UTC): 2025-12-28T22:41:00Z

Notes:
- Entry point: README.md for overview, architecture/01-tenant-scope.md for implementation start
- Extends existing UniversalEnvelope with mandatory tenant scope
- Provides runGuarded() kernel wrapper for all handler invocations
- Error detection as first-class subsystem

Areas:
- README.md — Project overview and status
- architecture/ — Design specifications and final architecture
- implementation/ — TypeScript type definitions and implementations
