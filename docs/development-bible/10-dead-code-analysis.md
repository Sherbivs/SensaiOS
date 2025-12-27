# Section 10: AI Coding Bible — Finding Dead, Stubbed, and Redundant Code

**Last Updated**: 2025-12-27 | **Status**: Production | **Cleanup Meetings**: #3-4 Complete (~14,500 lines)

**Purpose:** Comprehensive methodology for AI-driven dead code detection in large codebases  
**Prerequisites:** Understanding of CFG, data flow, and code analysis concepts  
**Estimated Reading Time:** 25 minutes

> **Context:** This guide was formalized during Meeting #3-4 of the Dead Code Cleanup initiative (December 2025), which removed ~14,500+ lines of verified dead code from the Infinity Gauntlet codebase.

---

## Table of Contents

1. [Terms and Definitions](#0-terms-because-words-are-sneaky)
2. [The Prime Directive](#1-the-prime-directive-evidence-beats-vibes)
3. [AI-Friendly Program Representations](#2-ai-friendly-program-representations-the-scriptures)
4. [Dead Code Detection Pipeline](#3-dead-code-detection-the-proof-first-pipeline)
5. [Dynamic Evidence](#4-dynamic-evidence-coverage--production-tracing)
6. [Stubbed Code Detection](#5-stubbed-code-detection-proven-patterns--semantic-heuristics)
7. [Redundant Code Detection](#6-redundant-code-detection-clones--compiler-style-redundancy)
8. [Optimal Architecture](#7-the-optimal-architecture-for-large-codebases)
9. [Game Server Heuristics](#8-heuristics-that-matter-specifically-in-game-servers)
10. [Scoring Model](#9-what-optimal-looks-like-in-practice)
11. [Implementation Notes](#10-implementation-notes-how-to-make-this-actually-scale)
12. [Safe Deletion Doctrine](#11-the-safe-deletion-doctrine)
13. [Starter Set](#12-minimal-starter-set-that-gives-huge-roi-fast)

---

## 0) Terms, because words are sneaky

### Dead code (three flavors)

Dead code isn't one thing:

* **Unreachable code**: there is **no control-flow path** from a function/method entry to that code. This is the classic "code after `return`" case.
* **Unreachable procedures/functions**: whole functions are unreachable from program entry points when analyzing a **call graph** (interprocedural reachability).
* **Semantically dead (but reachable) code**: executed but its computed values are never used (e.g., dead stores), or it has no effect on observable behavior. This is why "unreachable" ⊂ "dead".

### Stubbed code

"Stubbed" means "looks implemented structurally" but functionally does nothing useful yet:

* throws "not implemented"
* returns constant placeholders
* contains TODO markers
* empty bodies that should not be empty
* feature-flagged branches that always return early

This category is rarely provable purely by control/data-flow; it's often **heuristic + semantic**.

### Redundant code

Redundant can mean:

* **cloned/duplicated** code (copy-paste variants)
* repeated computations (classic compiler "common subexpression elimination" territory)
* redundant checks / conditions / conversions
* wrappers that add no behavior
* duplicated protocol parsing, validations, or state transitions (very common in game servers)

Clone detection is a mature research area with scalable approaches that are specifically designed for big code.

---

## 1) The Prime Directive: Evidence beats vibes

When the task is "delete code safely", the AI's job is not to be clever—it's to be **conservative, explainable, and falsifiable**.

So the system should treat findings as belonging to tiers:

| Tier | Type | Description |
|------|------|-------------|
| **Tier A (Proof)** | Structural | Reachability / liveness proofs on CFG/SSA/PDG. High precision. |
| **Tier B (Strong evidence)** | Dynamic | Zero runtime hits in tracing + zero coverage across representative workloads. |
| **Tier C (Heuristic suspicion)** | Pattern | Smells, patterns, naming, comments, shape. |
| **Tier D (Speculative)** | AI-only | LLM-only "seems unused" with no supporting graph/trace evidence. |

The Bible is mostly about maximizing Tier A and Tier B, and using AI to triage Tier C.

---

## 2) AI-friendly program representations (the "Scriptures")

A large AI system can't reason reliably over raw text alone. It wants **structures** that:

* are **incremental** (you'll re-run analysis constantly)
* are **queryable** (you want to ask "find all dead stores")
* are **mergeable across languages/services** (common in game stacks)
* compress the important semantics (control flow, data flow, calls, types)

### 2.1 Incremental parsing into CST/AST

For very large repos, incremental parsing matters. **Tree-sitter** is explicitly designed for incremental parsing and building concrete syntax trees that update efficiently as code changes.

**Why AI likes this:**

* stable node boundaries for diffs
* easy mapping from findings to source ranges
* fast re-analysis per changed file

### 2.2 Control Flow Graph (CFG)

A CFG models possible execution paths within a function: nodes are basic blocks, edges are jumps/branches. CFGs are the base for unreachable code elimination, liveness, and many optimizations.

### 2.3 Data-flow analysis + liveness (to find dead stores)

Liveness is a backward data-flow analysis: a variable is "live" at a point if its value may be used on some path before being overwritten. This is foundational for dead code elimination and dead-store elimination.

### 2.4 Static Single Assignment (SSA)

SSA form gives each variable a single assignment version, making many analyses simpler and faster.

**Why AI likes SSA:**

* use-def chains become easy to compute
* dead assignments pop out more clearly
* value numbering / redundancy detection gets easier

### 2.5 Program Dependence Graph (PDG)

A PDG explicitly represents **data dependences and control dependences** between operations. It enables optimizations and program understanding by making dependencies first-class.

**Why AI likes PDG:**

* slicing ("what affects this output?") becomes a graph walk
* dead code can be framed as "no path to any observable sink"

### 2.6 Code Property Graph (CPG) — the "one graph to query them all"

A CPG merges AST + CFG + dependence information into one graph representation and is used for scalable code mining with graph traversals/queries.

For *large* codebases, CPG tooling is explicitly designed for **incremental and distributed** analysis.

### 2.7 Call graph (interprocedural reachability)

Unreachable procedure elimination is basically reachability on the call graph: start from entrypoints (e.g., `main` or service start handlers) and mark reachable callees.

This is essential in a game server where "entrypoints" are not just `main`—they're:

* network packet handlers
* command registries
* scheduled jobs / tick loops
* event bus subscribers
* plugin hooks
* RPC endpoints

---

## 3) Dead code detection: the "Proof-First" pipeline

### 3.1 Unreachable statements/blocks (intra-procedural)

**Goal:** find code with no CFG path from the function entry.

**Algorithm (CFG reachability):**

1. Build CFG.
2. Do a graph search from entry block.
3. Any basic block not visited is unreachable.
4. Map unreachable blocks back to statements/ranges.

**AI-friendly outputs (what the system should emit):**

* file + range
* CFG witness: "no path from entry"
* nearest dominating exit (e.g., `return`, `throw`, infinite loop)

**Game-server special cases (false positives):**

* debug-only code executed via `goto`-style jumps (rare in modern code)
* code reachable only via exceptions (make sure CFG includes exceptional edges)
* language-specific constructs (e.g., JS `finally`, C++ destructors)

### 3.2 Unreachable branches (constant conditions)

A ton of real-world dead code comes from:

* feature flags that became constants
* build-time config constants
* platform checks inside a now-single-platform deployment

After **constant propagation/folding**, branches can become unreachable and thus eliminable.

**Practical method:**

* Use an abstract interpretation or constant propagation pass on SSA/CFG.
* When a branch condition becomes constant, mark the other branch unreachable.

### 3.3 Unreachable procedures/functions (interprocedural)

Use the call graph approach:

* Start from known entrypoints (service boot, handler registries, exported APIs, test harness entrypoints).
* Mark reachable functions.
* Anything unmarked is "unreachable procedure" candidate.

**Hard part:** dynamic dispatch and reflection.
So for safety, treat the call graph as **conservative**:

* include virtual calls as edges to possible targets (language-dependent)
* include reflection sinks and registry patterns as "may-call" edges (heuristics)

**Evidence the AI should attach:**

* "no call graph path from any entrypoint"
* list of entrypoints considered
* why dynamic mechanisms were/weren't modeled

### 3.4 Dead stores / unused computations (reachable but pointless)

This is the classic "value computed but never used" case. Liveness is your hammer.

**Method:**

* Build def/use sets per statement.
* Run backward liveness analysis on the CFG.
* An assignment to `x` is dead if `x` is not live after that assignment, and the RHS has no side effects.

**Key nuance (huge in servers): side effects**
A lot of "dead looking" code is actually:

* logging
* metrics
* mutation of shared state
* I/O
* events
* locking

So the AI must model side effects conservatively:

* function calls are side-effecting unless proven pure
* writes to memory / fields are side-effecting unless proven local and unused

### 3.5 Dead code vs. dead-but-reachable

Don't confuse:

* "unreachable" (CFG says cannot execute) with
* "dead" (executes but has no effect)

Unreachable code is dead, but not all dead code is unreachable.

This matters because a lot of server redundancy is the second kind.

---

## 4) Dynamic evidence: coverage + production tracing (reality checks)

Static proofs are great, but large servers have dynamic behavior:

* plugins, scripts, hot loading
* config-driven routing
* reflection / dependency injection
* "stringly-typed" event names
* data-driven gameplay definitions

So you also want **runtime evidence**.

### 4.1 Test coverage (what executed under tests)

Coverage tooling exists across ecosystems:

* **gcov** is GCC's coverage tool
* **llvm-cov** supports showing/exporting coverage for instrumented programs
* For JS/TS, **Istanbul/nyc** instruments code with counters

**How AI should use coverage:**

* Coverage does **not** prove deadness. It proves "not hit by this workload."
* Combine with static reachability:

  * "statically reachable + never covered" ⇒ candidate for targeted testing or deprecation
  * "statically unreachable" ⇒ safe to remove (Tier A), coverage irrelevant

### 4.2 Production tracing (what executed in real life)

For a game server, production evidence is gold:

* "this packet handler was never called in 30 days"
* "this admin command exists but is unused"
* "this matchmaking branch never taken"

**AI-friendly approach:**

* Instrument entrypoints: request handlers, packet decoders, event dispatch, tick subsystems.
* Record call counts keyed by stable symbol IDs (function signature hash).
* Feed "never observed" signals into deadness scoring.

**Caution:**

* absence of evidence is not evidence of absence unless your instrumentation coverage is known and your time window is meaningful.
* seasonal events, rare items, admin tooling, disaster recovery code may be legitimately "cold".

---

## 5) Stubbed code detection: proven patterns + semantic heuristics

Stubbed code is often *reachable* and sometimes *executed*—it just doesn't do what the name/signature promises.

### 5.1 High-precision syntactic stub signatures

These are the "easy wins" and scale well:

* Function body is empty (and not an intentionally abstract method).
* Single-statement bodies:

  * `throw new Error("NotImplemented")`
  * `return null` / `return 0` / `return false` / `return {}` with no comment justification
  * `return` early in a non-void function with default
* Contains tokens like `TODO`, `FIXME`, `HACK`, `stub`, `not implemented`
* Conditional compilation or feature flags where one branch is placeholder

**AI-friendly parse method:**

* Tree-sitter/CST queries can catch these cheaply and incrementally.

### 5.2 Behavioral stub signals (strong evidence)

* called at runtime but always returns the same constant
* called at runtime and always throws
* called at runtime and does no side effects (no state change)

These are detectable via tracing/profiling logs.

### 5.3 Semantic mismatch heuristics (LLM-assisted, but checkable)

This is where AI earns its keep, cautiously:

* Name implies behavior: `loadPlayerInventory`, but implementation returns empty list.
* Interface contract suggests: `validatePurchase`, but always returns `true`.
* "suspicious symmetry": functions with similar names perform real work, but this one is trivial.

**Rule:** the AI must attach *evidence*: AST pattern + call sites + runtime behavior. Without that, keep it as Tier C.

---

## 6) Redundant code detection: clones + compiler-style redundancy

On big codebases, redundancy is where you can reclaim serious maintenance budget.

### 6.1 Clone detection (Type-1/2/3/4)

Clone detection techniques vary by robustness and scale:

* **NiCad**: hybrid approach using parsing + flexible pretty-printing/normalization
* **DECKARD**: scalable tree-based clone detection using tree representations
* **SourcererCC**: token-based clone detection designed to scale to very large repositories

**What to do with clones (important):**

* Finding clones is not the same as "remove one copy."
* In servers, clones can be intentional divergence points (e.g., different game modes).
* The right move is often:

  * factor shared logic into a helper, or
  * unify data-driven rules, or
  * enforce shared validation via a single module

### 6.2 Redundant computation (common subexpression elimination logic)

**Server-specific examples:**

* repeated parsing of the same packet fields
* repeated decoding of a JWT/session token
* repeated "get player by id" within a tick
* repeated computation of derived stats in multiple systems

An AI system can detect candidates by:

* building SSA/available-expression analysis (Tier A for local redundancy)
* using PDG/CPG pattern queries for repeated idioms (Tier A/B depending on purity/aliasing)
* correlating with profiling hotspots (Tier B)

### 6.3 Redundant control logic (duplicate checks, shadow conditions)

Classic signals:

* identical `if` conditions repeated in nested scopes
* checks that are implied by earlier guards
* validation repeated both at RPC boundary and deeper layer (sometimes intentional)

Here, PDG/CPG shines because control dependences are explicit.

---

## 7) The "Optimal" architecture for large codebases: multi-pass, incremental, evidence-ranked

Here's a practical blueprint that scales.

### 7.1 Pass 0: Pre-filter (avoid wasting cycles)

Before analysis:

* exclude vendored deps, build outputs, generated code (or tag them)
* deduplicate identical files by hash
* parse only changed files incrementally (Tree-sitter helps)

### 7.2 Pass 1: Build the core semantic index

For each module/package:

* CST/AST
* symbol table + references
* intra-procedural CFG per function
* call graph edges (conservative)

### 7.3 Pass 2: Proof-grade dead code

* unreachable blocks (CFG reachability)
* unreachable functions (call graph reachability)
* dead stores (liveness / neededness)

### 7.4 Pass 3: CPG/graph queries for cross-cutting patterns

If you can afford it, unify per-language frontends into a CPG-like graph representation and run queries.

### 7.5 Pass 4: Clone and redundancy mining (big wins)

Run one or more clone detectors depending on your tolerance for compute and false positives:

* token-based scalable (SourcererCC)
* tree-based (DECKARD)
* normalization-based near-miss (NiCad)

### 7.6 Pass 5: Dynamic corroboration

* run coverage in CI
* run production tracing for entrypoints (OpenTelemetry)

### 7.7 Pass 6: AI ranking + human-facing explanations

AI should produce:

* a **confidence score** broken down by evidence type (A/B/C)
* an **explanation** with graph witnesses:

  * "No path from entry"
  * "No callers from entrypoints"
  * "Value not live after assignment"
  * "Clone group of size N with similarity threshold T"
* a **safe remediation plan**:

  * "delete"
  * "deprecate behind flag"
  * "add targeted test"
  * "instrument and observe for 14 days"

---

## 8) Heuristics that matter specifically in game servers

Large servers have patterns that fool naive dead-code detectors.

### 8.1 "Entry points are data-driven"

Handlers are often registered like:

* packet ID → function
* command string → handler
* event name → subscriber
* cron key → job

So the AI must build **registry edges**:

* treat registrations as call edges
* treat strings/IDs as symbolic references

If you don't, you'll "delete dead code" and instantly break obscure packet types.

### 8.2 "Cold code isn't dead code"

Game servers have legit cold code:

* seasonal events
* admin tools
* migration logic
* disaster recovery
* anti-cheat tripwires
* region-specific code paths

So incorporate:

* runtime observation windows that cover business cycles
* config scans (what flags exist, what's enabled)
* "executed in prod ever?" as a long-term signal, not a day-to-day one

### 8.3 "Side effects are everywhere"

In servers, a lot of important code looks "unused" if you only track return values:

* telemetry
* audit logs
* cache warming
* locks
* enqueueing messages

So data-flow must treat side effects conservatively.

---

## 9) What "optimal" looks like in practice: a scoring model that doesn't lie

Here's a sane, explainable scoring approach for large systems:

### Deadness score components

| Component | Description | Tier |
|-----------|-------------|------|
| **S_unreachable_cfg** | 1 if CFG-unreachable | A |
| **S_unreachable_callgraph** | 1 if no callgraph path from any entrypoint set | A/B |
| **S_dead_store** | 1 if proven dead assignment and RHS pure | A |
| **S_coverage_zero** | scaled value if never covered | B |
| **S_prod_hits_zero** | scaled value if never observed in tracing | B |
| **S_reflection_risk** | penalty if symbol matches reflection/registry patterns | - |
| **S_public_api_risk** | penalty if exported/public (library boundary) | - |

Then:

* If **S_unreachable_cfg = 1**, you can almost always treat as deletable (still check weird language semantics).
* If only dynamic evidence exists, prefer "deprecate + observe" instead of delete.

### Stub score components

* syntactic stub patterns (high weight)
* runtime always-throws or constant-return (high weight)
* semantic mismatch between name/type and behavior (medium weight, needs human review)

### Redundancy score components

* clone group size and similarity
* call frequency (hot duplicates matter more)
* divergence risk (how much did they already differ?)
* whether extraction is safe (shared dependencies, side effects)

---

## 10) Implementation notes: how to make this actually scale

### 10.1 Incremental everything

* Parse incrementally (Tree-sitter)
* Cache per-file AST/CFG and reuse unchanged artifacts
* Build module summaries ("this module exports these handlers/registrations")

### 10.2 Distributed graph indexing

For truly huge repos, build a graph database / property graph store:

* CPG ecosystems are explicitly designed for incremental/distributed code analysis.

### 10.3 Use scalable clone detection methods

SourcererCC is explicitly designed to scale clone detection with inverted-index heuristics.

This matters because clone detection can otherwise be O(N²) pain.

---

## 11) The "Safe Deletion" doctrine (because production is unforgiving)

For each candidate deletion, the AI should generate a checklist:

1. **Proof**: unreachable CFG or dead store proven?
2. **Entrypoint audit**: is it registered in any handler/registry table?
3. **Dynamic audit**: any prod hits? any coverage?
4. **Risk tags**: public API? reflection? plugin interface?
5. **Removal plan**:

   * delete
   * or deprecate with warning/log
   * or guard behind feature flag and collect usage telemetry
6. **Verification**:

   * compile + unit/integration tests
   * run a server simulation (bots, load tests)
   * monitor error rates

---

## 12) Minimal "starter set" that gives huge ROI fast

If you want the 80/20 for a massive server:

1. **CFG unreachable block finder** (fast, high precision)
2. **Callgraph unreachable function finder from real entrypoints**
3. **Liveness-based dead store finder**
4. **Stub pattern scanner with CST queries (Tree-sitter)**
5. **Token-based clone detection (SourcererCC)**
6. **Coverage + tracing to corroborate**

That stack already catches a shocking amount of junk safely.

---

## Infinity Gauntlet: Applied Examples

### Meeting #3-4 Methodology (December 2025)

The dead code cleanup meetings applied these principles:

**Tier A (Proof) - Zero Import Verification:**
```powershell
# Count external imports excluding self-references
Get-ChildItem -Path "src" -Filter "*.ts" -Recurse | 
  Select-String -Pattern "from.*<candidate-file>" | 
  Where-Object { $_.Path -notmatch "<candidate-file>" } | 
  Measure-Object
```

**Candidates verified with 0 imports:**
- `src/services/base-repository.ts` (627 lines)
- `src/services/trainer-repository.ts` (630 lines)
- `src/services/pokemon-repository.ts` (822 lines)
- `src/services/battle-repository.ts` (748 lines)
- `src/services/audit-service.ts` (592 lines)
- `src/services/database-metrics.ts` (360 lines)

**Tier B (Dynamic) - Build Verification:**
```powershell
npm run build 2>&1 | Select-String -Pattern "error|Error|✓|✗|success|fail"
```

**Results:**
- Meeting #3: 12 files, 6,703 lines removed
- Meeting #4: 15 files, ~7,824 lines removed
- **Total: ~14,527 lines of verified dead code**

### Pattern Identified: Database-Centric Sprint Orphans

The largest cluster of dead code came from the Database-Centric Sprint - services that were **built but never integrated**:

* Repository pattern files (never extended/instantiated in runtime)
* Metrics infrastructure (never wired to startup)
* Pool configuration (only consumer was deleted metrics)

**Lesson:** Build verification (does it compile without errors?) is a strong Tier A signal when combined with zero-import analysis.

---

## See Also

- **[Testing Patterns](02-testing-patterns.md)** — Coverage tooling and test strategies
- **[Performance](04-performance.md)** — Profiling and optimization
- **[Database Onboarding](09-database-onboarding.md)** — Current database patterns (updated after Meeting #4)
- **[Operations Bible: Monitoring](../operations-bible/05-monitoring.md)** — Production tracing setup

---

## References

1. Tai-e: Dead Code Detection - https://tai-e.pascal-lab.net/en/pa3.html
2. Cambridge: Unreachable Procedure Elimination - https://www.cl.cam.ac.uk/teaching/2021/OptComp/slides/lecture02.pdf
3. LibFirm: Unreachable Code - https://libfirm.github.io/Unreachable_Code.html
4. NiCad: Near-Miss Clone Detection - https://research.cs.queensu.ca/home/cordy/Papers/RC_ICPC08_NICAD.pdf
5. Tree-sitter: Incremental Parsing - https://github.com/tree-sitter/tree-sitter
6. Harvard: CFG Dataflow - https://groups.seas.harvard.edu/courses/cs153/2018fa/lectures/Lec17-CFG-dataflow.pdf
7. MIT: Introduction to Dataflow Analysis - https://ocw.mit.edu/courses/6-035-computer-language-engineering-sma-5502-fall-2005/
8. Cytron et al: SSA Construction - https://www.cs.utexas.edu/~pingali/CS380C/2010/papers/ssaCytron.pdf
9. Ferrante: Program Dependence Graph - https://www.cs.utexas.edu/~pingali/CS395T/2009fa/papers/ferrante87.pdf
10. IEEE S&P: Code Property Graphs - https://www.ieee-security.org/TC/SP2014/papers/ModelingandDiscoveringVulnerabilitieswithCodePropertyGraphs.pdf
11. Joern: CPG Specification - https://cpg.joern.io/
12. ShiftLeft: CPG Tooling - https://github.com/ShiftLeftSecurity/codepropertygraph
13. Harvard: Optimization Lecture - https://groups.seas.harvard.edu/courses/cs153/2019fa/lectures/Lec19-Optimization.pdf
14. GCC: Gcov - https://gcc.gnu.org/onlinedocs/gcc/Gcov-Intro.html
15. Clang: Source-Based Coverage - https://clang.llvm.org/docs/SourceBasedCodeCoverage.html
16. Istanbul/nyc - https://github.com/istanbuljs/nyc
17. OpenTelemetry: Trace Semantics - https://opentelemetry.io/docs/specs/semconv/general/trace/
18. DECKARD: Tree-based Clone Detection - https://www.cs.ucdavis.edu/~su/publications/icse07.pdf
19. SourcererCC: Scalable Clone Detection - https://arxiv.org/pdf/1512.06448
20. BigCloneBench: Evaluating Clone Detectors - https://clones.usask.ca/pubfiles/articles/SvajlenkoEvaluatingToolsICSME2015.pdf
21. Cornell: Common Subexpression Elimination - https://www.cs.cornell.edu/courses/cs4120/2016sp/lectures/28cse/lec28-sp16.pdf
22. CMU: Dataflow Analysis - https://www.cs.cmu.edu/~fp/courses/15411-f14/lectures/05-dataflow.pdf

---

**Last Updated:** 2025-12-20  
**Revision:** 1.0 — Initial creation from Dead Code Cleanup initiative  
**Part of:** Development Bible
