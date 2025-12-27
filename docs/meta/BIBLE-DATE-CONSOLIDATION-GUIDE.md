# Bible System Date Consolidation — Quick Implementation Guide

**Date**: 2025-12-27  
**Purpose**: Step-by-step guide to standardize dates across all Bible documentation  
**Estimated Time**: 1-2 hours

---

## ✅ Phase 1 Complete: Operations Bible INDEX

**File**: `docs/operations-bible/INDEX.md`  
**Status**: ✅ Updated with "Last Updated: 2025-12-27"

---

## Phase 2: Add Section-Level Dates (In Progress)

### Operations Bible Sections (13 sections)

| Section | File | Current Status | Action Needed |
|---------|------|----------------|---------------|
| § 1 | 01-service-matrix.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 2 | 02-database-operations.md | Has date in content | Standardize header format |
| § 3 | 03-deployment-procedures.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 4 | 04-environment-management.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 5 | 05-monitoring.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 6 | 06-optimization-history.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 7 | 07-scheduled-restart.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 8 | 08-recovery-runbook.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 9 | 09-discord-cache.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 10 | 10-database-audit.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 11 | 11-logging-storage.md | No date header | Add "**Last Updated**: 2025-12-27" after title |
| § 12 | 12-analytics-queries.md | No date header | Add "**Last Updated": 2025-12-27" after title |
| § 13 | 13-memory-management.md | No date header | Add "**Last Updated**: 2025-12-27" after title |

### Architecture Bible Sections (27 sections)

| Section | File | Current Status | Action Needed |
|---------|------|----------------|---------------|
| § 1 | 01-system-overview.md | No explicit date | Add "**Last Updated**: 2025-12-27" |
| § 2 | 02-database-architecture.md | No explicit date | Add "**Last Updated**: 2025-12-18" (Prisma 7) |
| § 7 | 07-security-bot.md | No explicit date | Add "**Last Updated**: 2025-12-27" + Phase 1 status |
| § 18 | 18-private-channel-architecture.md | Has date | Verify "2025-11-21" correct |
| Others | Various | Mixed | Add dates systematically |

### Development Bible Sections (10 sections)

| Section | File | Current Status | Action Needed |
|---------|------|----------------|---------------|
| § 1 | 01-local-setup.md | No explicit date | Add "**Last Updated**: 2025-12-27" |
| § 2 | 02-testing-patterns.md | No explicit date | Add "**Last Updated**: 2025-12-27" |
| § 10 | 10-dead-code-analysis.md | Has date | Verify "2025-12-20" correct |
| Others | Various | Mixed | Add dates systematically |

---

## Standard Date Header Format

### For Section Files

**Insert immediately after section title, before first horizontal rule:**

```markdown
# Section X: Title

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to Index](INDEX.md)

---

[Content begins here]
```

**Example for Operations Bible § 1:**

```markdown
# Section 1: Service Matrix

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [Next: Database Operations →](02-database-operations.md)

---

**Philosophy**: "Know your workers..."
```

---

## Priority Updates

### 🚨 Critical (Today)

1. **Architecture Bible § 7** (Security Bot)
   - Add "**Last Updated**: 2025-12-27"
   - Add "**Phase 1 DB Migration**: ✅ Complete (500 role changes, 3 baselines → PostgreSQL)"
   - Reason: Phase 1 just completed, needs immediate documentation

2. **Operations Bible § 2** (Database Operations)
   - Already has SSL update (2025-12-27)
   - Verify date format standardized

3. **Prisma 7 Bible** (standalone)
   - Already current with 2025-12-27
   - ✅ No action needed

### ⚠️ High Priority (This Week)

4. **Operations Bible § 1-13**
   - Add "Last Updated" to all 13 sections
   - Use 2025-12-27 for recent reviews
   - Use earlier dates for sections not recently changed

5. **Development Bible § 1-10**
   - Add "Last Updated" to all 10 sections
   - Use 2025-12-27 for recent reviews

6. **Architecture Bible** (remaining sections)
   - Add dates to sections without them
   - Verify existing dates are accurate

---

## Date Selection Guidelines

### When to Use 2025-12-27

- Section was reviewed today
- Section contains references to recent work (Phase 1 migration, SSL fix)
- Section is part of today's consolidation effort

### When to Use Earlier Dates

- Section has clear "last modified" date in git history
- Section documents work completed on specific date
- Section hasn't changed since known date

### When Uncertain

- Use 2025-12-27 (today's review date)
- Add note: "Date reflects review, not last content change"

---

## Quick Commands for Date Verification

```powershell
# Find all markdown files without "Last Updated" field
Get-ChildItem -Recurse -Filter "*.md" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -notmatch "Last Updated") {
        $_.FullName
    }
}

# Find files in bibles without dates
Get-ChildItem "docs/*-bible/*.md" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -notmatch "Last Updated") {
        Write-Host "Missing date: $($_.Name)"
    }
}
```

---

## Implementation Checklist

### Step 1: Operations Bible (13 files)
- [ ] § 1: Service Matrix
- [ ] § 2: Database Operations (verify)
- [ ] § 3: Deployment Procedures
- [ ] § 4: Environment Management
- [ ] § 5: Monitoring
- [ ] § 6: Optimization History
- [ ] § 7: Scheduled Restart
- [ ] § 8: Recovery Runbook
- [ ] § 9: Discord Cache
- [ ] § 10: Database Audit
- [ ] § 11: Logging Storage
- [ ] § 12: Analytics Queries
- [ ] § 13: Memory Management

### Step 2: Architecture Bible (27 files)
- [ ] § 1: System Overview
- [ ] § 2: Database Architecture
- [ ] § 3: Worker Architecture
- [ ] § 4: Event Bus
- [ ] § 5: Logging Architecture
- [ ] § 6: Error System
- [ ] § 7: Security Bot (PRIORITY — Phase 1)
- [ ] § 8: Router System
- [ ] § 9: Game Engine
- [ ] § 10: Discord Bot
- [ ] § 11: Safety Guarantees
- [ ] § 12: Observability
- [ ] § 13: Performance
- [ ] § 14: Future Roadmap
- [ ] § 15: Project History
- [ ] § 16: Boot Sequence
- [ ] § 17: Service Registry
- [ ] § 18: Private Channel Architecture (verify)
- [ ] § 19: Seamless Restart
- [ ] § 20: Resource Limits
- [ ] § 21: Security Database
- [ ] § 22: Starter Selection Flow
- [ ] § 23: Game Design Bible
- [ ] § 24: Fishing System
- [ ] § 25: Trading System
- [ ] § 26: Leaderboards & Achievements
- [ ] § 27: /Store DB-Only Policy

### Step 3: Development Bible (10 files)
- [ ] § 1: Local Setup
- [ ] § 2: Testing Patterns
- [ ] § 3: Debugging Guides
- [ ] § 4: Performance
- [ ] § 5: Error Handling
- [ ] § 6: Console Tooling
- [ ] § 7: Utilities
- [ ] § 8: Profiling
- [ ] § 9: Database Onboarding
- [ ] § 10: Dead Code Analysis (verify)

---

## After Implementation

### Verify Consistency

```powershell
# Count sections with dates in each bible
Get-ChildItem "docs/operations-bible/0*.md" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match "Last Updated") { "✅ $($_.Name)" }
    else { "❌ $($_.Name)" }
}
```

### Update Documentation

After all dates added:
1. Update `docs/meta/MARKDOWN-INVENTORY-2025-12-27.md` with completion status
2. Add note to `Prompt.md` about date standardization
3. Create git commit: "docs: Standardize dates across bible system"

---

## Success Criteria

- [ ] All 3 bible INDEX files have "Last Updated"
- [ ] All 50 bible sections have "Last Updated"
- [ ] Format is consistent across all files
- [ ] Dates are accurate (recent work = 2025-12-27)
- [ ] Architecture Bible § 7 reflects Phase 1 completion

---

**Status**: Phase 1 complete (Operations Bible INDEX), Phase 2 in progress  
**Next**: Manual update of individual section files with standardized date headers

