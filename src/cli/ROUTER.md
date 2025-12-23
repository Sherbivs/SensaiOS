# ROUTER
Title: CLI Tools
Purpose: Command-line interface tools for runtime operations
Owned Globs: src/cli/**
Last Updated (UTC): 2025-12-23T00:00:00Z

Notes:
- 2025-12-23: Created during Architecture Audit Meeting #6
- CLI tools that import from src/services for runtime analysis
- Used via npm scripts (ai-logs:query, ai-logs:analyze, etc.)

Areas:
- ai-log-query.ts — AI log querying and analysis CLI (commander-based)
