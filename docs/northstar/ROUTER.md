# ROUTER
Title: Northstar Methodology Documentation
Purpose: Northstar schema consolidation methodology and implementation phases.
Owned Globs: docs/northstar/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Northstar methodology for schema consolidation and optimization
- Phased approach to schema migrations with verification and rollback
- Contract verification, QA checklists, and state tracking
- Schema optimization strategies and performance improvements

Key Documents:
- **northstar-methodology.md** - Northstar schema consolidation methodology
  * Principles: Incremental changes, verification at each step, rollback safety
  * Phases: Discovery → Design → Implementation → Verification → Solidification
  * Success criteria: Zero data loss, zero downtime, performance improvements
- **northstar-phase1-contract-verification.md** - Phase 1 contract verification
  * Pre-migration contract validation
  * Schema compatibility checks
  * Foreign key constraints verification
  * Data integrity validation
- **northstar-phase1-handoff.md** - Phase 1 handoff documentation
  * Completed migrations and outcomes
  * Known issues and workarounds
  * Handoff checklist and next steps
- **northstar-phase2-consolidation.md** - Phase 2 consolidation guide
  * User/TrainerProfile consolidation strategy
  * Migration scripts and rollback procedures
  * Testing requirements and validation
- **northstar-qa-checklist.md** - QA checklist for schema changes
  * Pre-migration checklist (backups, validation, dry-run)
  * Post-migration verification (data integrity, performance, functionality)
  * Rollback procedures and recovery steps
- **northstar-schema-state.md** - Current schema state tracking
  * Active tables and relationships
  * Pending migrations and dependencies
  * Schema evolution history
- **northstar-solidification-summary.md** - Solidification phase summary
  * Schema stabilization outcomes
  * Performance improvements achieved
  * Lessons learned and best practices
- **schema-northstar-optimization.md** - Schema optimization strategies
  * Index optimization and query performance
  * Table partitioning and archival strategies
  * Denormalization opportunities

Northstar Phases:
1. **Discovery** - Schema analysis, pain points identification, consolidation opportunities
2. **Design** - Target schema design, migration strategy, rollback planning
3. **Implementation** - Phased migration execution with verification gates
4. **Verification** - Data integrity checks, performance testing, functionality validation
5. **Solidification** - Schema stabilization, optimization, documentation updates

Migration Principles:
- **Incremental**: Small, verifiable steps
- **Reversible**: Every migration has rollback script
- **Validated**: Pre/post checks at each phase
- **Documented**: Complete audit trail of changes

Cross-References:
- See prisma/schema.prisma for current schema
- See prisma/migrations/ for migration history
- See docs/database/ for database architecture
