# DATA SCHEMA

**This document has been consolidated into the Bible system.**

**See:** `docs/operations-bible/database-operations-runbook-comprehensive.md` § 4 (Schema Architecture & Data Models)

**Quick Reference:**

**Persistent Entities:** Users, PokemonInstances, Parties, Encounters, Battles, Cooldowns

**Reference Data (Dex Spine):** Type, Ability, Item, Move, Species, SpeciesType, SpeciesAbility, SpeciesLearnset, EvolutionStep, TypeChart, NameVariant, SpeciesSheet

**Performance Indexes:** See database-operations-runbook-comprehensive.md § 4.5 (Index Strategy) for complete indexing documentation

**📚 Task 12 Comprehensive Guide (AUTHORITATIVE):**
- **database-operations-runbook-comprehensive.md** (25 pages) — Complete database operations, schema architecture, live game real-time requirements (<1μs cache, <50μs writes), master-mirror-staging pipeline

---

**Last Consolidated:** 2025-11-17  
**Last Updated:** 2025-12-02 (Task 12 reference update)  
**Original Revision:** 0.3
