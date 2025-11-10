# ROUTER
Title: Console Output Documentation
Purpose: Console output standardization, formatting standards, and implementation reports.
Owned Globs: docs/console-output/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Comprehensive standards for consistent CLI/script output formatting
- Centralized output-formatter utility for all scripts
- Project completed across 11 scripts with zero regressions

Key Documents:
- **console-output-standards.md** - Comprehensive standards for consistent output formatting
  * Formatting functions (section headers, info, success, warnings, errors)
  * Status indicators, progress reporting, duration tracking
  * Table formatting, data display, interactive elements
- **console-output-quick-reference.md** - Quick reference guide for common patterns
  * Common formatting functions with examples
  * Status indicators and progress reporting
  * Best practices and usage patterns
- **console-output-project.md** - Project plan and migration strategy
  * Implementation phases and timeline
  * Target scripts and success criteria
  * Migration approach and testing strategy
- **console-output-final-report.md** - Final report documenting completion
  * 11 scripts standardized with 0 regressions
  * Complete migration from raw Write-Host to output-formatter
  * Unified formatting, color schemes, and status indicators

Implementation:
- **Utility**: scripts/utils/output-formatter.ps1
- **Standardized Scripts**:
  * setup_ai_env.ps1 - Environment setup
  * bootstrap_staging_db.ps1 - Database bootstrap
  * auto_bootstrap_local_db.ps1 - Local database setup
  * ensure_postgres_bundle.ps1 - PostgreSQL installation
  * fetch_pokemon.mjs - Pokemon data fetching
  * build-data.js - Data pipeline build
  * refresh_cache_gh_only.mjs - Cache refresh
  * validate_database_urls.js - Database URL validation
  * Plus 3 additional scripts

Cross-References:
- See scripts/utils/output-formatter.ps1 for utility implementation
- See scripts/ROUTER.md for script documentation
