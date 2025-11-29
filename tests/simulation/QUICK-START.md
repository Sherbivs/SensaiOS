# Simulation Framework - Quick Start Guide

**Status:** 87.5% Complete (7/8 tasks) | **Updated:** November 28, 2025

## 🎯 What You Have Now

A comprehensive simulation framework for testing Pokémon Infinity Gauntlet without Discord:

1. **143 Test Cases** across 5 scenario files
2. **21 Custom Matchers** for expressive assertions
3. **Test Runner** with parallel execution & reporting
4. **4 Report Formats** (Console, JSON, HTML, Markdown)
5. **Minimal Chat UI** for manual testing

## 🚀 Quick Start

### 1. Test the Chat UI (Manual Testing)

```powershell
# Open the Discord-like test interface
cd tests\simulation
.\open-chat-ui.ps1
```

**Try these commands:**
- `/starter` - Choose Charmander, Bulbasaur, or Squirtle
- `/home` - View your party and stats
- `/walk` - Encounter a wild Pokémon
- `/heal` - Heal all Pokémon
- `/battle @opponent` - Challenge another trainer

### 2. Run Automated Tests

```powershell
# Run all test scenarios
node tests/simulation/test-runner.ts --verbose

# Run specific scenario
node tests/simulation/test-runner.ts onboarding

# Run in parallel (faster)
node tests/simulation/test-runner.ts --parallel

# Run by category
node tests/simulation/test-runner.ts --category=core
```

### 3. Generate Reports

```typescript
// In Node.js or a script
import { TestRunner } from "./tests/simulation/test-runner.js";
import { ReportGenerator } from "./tests/simulation/report-generator.js";

const runner = new TestRunner();
const summary = await runner.runAll();

const generator = new ReportGenerator();

// Console report (colored)
console.log(generator.generateConsoleReport(summary));

// Save HTML report
await generator.saveReport(summary, "html");

// Save JSON for CI/CD
await generator.saveReport(summary, "json");
```

## 📂 File Structure

```
tests/simulation/
├── ARCHITECTURE.md              # System design (Task 1)
├── discord-mocks.ts            # 7 mock Discord classes (Task 2)
├── simulation-engine.ts        # Game environment orchestrator (Task 3)
├── simulated-player.ts         # AI players with 4 personalities (Task 4)
├── assertions.ts               # 21 custom Vitest matchers (Task 6)
├── test-runner.ts              # Batch test execution (Task 7)
├── report-generator.ts         # Multi-format reporting (Task 7)
├── chat-ui.html                # Manual test interface (Task 7)
├── open-chat-ui.ps1            # Launch script (Task 7)
│
├── scenarios/
│   ├── onboarding.spec.ts      # 27 tests - Starter selection, homestead
│   ├── wild-encounters.spec.ts # 29 tests - AI decisions, catch/fight/run
│   ├── battles.spec.ts         # 25 tests - PvP, personality matchups
│   ├── homestead.spec.ts       # 30 tests - Channel validation, permissions
│   └── stress.spec.ts          # 32 tests - Performance, concurrency
│
└── examples/
    └── assertion-examples.spec.ts # Usage examples for custom matchers
```

## 🎮 Test Scenarios Overview

### Onboarding (27 tests)
- Starter selection for all personalities
- Homestead channel creation
- Party initialization
- First-time user experience

### Wild Encounters (29 tests)
- Encounter triggering
- AI decision-making (catch/fight/run)
- Catch mechanics with thresholds
- Multiple consecutive encounters

### Battles (25 tests)
- Battle initiation
- AI battle decisions
- Turn-by-turn simulation
- Personality matchups (aggressive vs defensive)

### Homestead (30 tests)
- Channel creation with correct naming
- Permission validation (user/bot access)
- Message delivery
- DM → Homestead migration validation

### Stress (32 tests)
- 10-50 concurrent players
- 5 simultaneous battles
- Performance benchmarks (<10s target)
- Memory management

## 🧪 Custom Assertions

Import assertions in any test file:

```typescript
import { expect } from "vitest";
import "../assertions.js"; // Extend Vitest

// Player assertions
expect(player).toHavePokemon(3);
expect(player).toHaveStarter("Charmander");
expect(player).toHaveFullParty();

// Homestead assertions
expect(validation).toHaveValidHomestead();
expect(validation).toHaveCorrectHomesteadName("TestUser");

// Battle assertions
expect(result).toHaveBattleWinner(player1);
expect(result).toHaveMinimumBattleTurns(5);
expect(result).toHaveMoveHistory();

// Encounter assertions
expect(result).toHaveCaptured();
expect(result).toHaveEscaped();

// Pokemon state assertions
expect(pokemon).toBeAtFullHp();
expect(pokemon).toHaveMoves(["Tackle", "Growl"]);
expect(pokemon).toHaveHpBelowThreshold(30);
```

## 📊 Report Formats

### Console (Colored Terminal)
```
═══════════════════════════════════════
   📊 SIMULATION TEST REPORT
═══════════════════════════════════════
🎯 OVERALL RESULTS:
  Scenarios:  5/5
  Tests:      143/143
⚡ PERFORMANCE:
  Total Duration:    8.45s
  Performance Target: ✅ MET
```

### JSON (Machine-Readable)
```json
{
  "timestamp": "2025-11-28T10:00:00.000Z",
  "summary": {
    "totalScenarios": 5,
    "scenariosPassed": 5,
    "totalTests": 143,
    "testsPassed": 143
  }
}
```

### HTML (Browser-Viewable)
- Interactive dashboard
- Color-coded metrics
- Progress bars
- Failed scenario details

### Markdown (Documentation)
- Tables for results
- GitHub-friendly formatting
- Performance breakdown

## 🎯 Performance Targets

**Goal:** <10 seconds for full test suite

**Strategies:**
1. **Parallel Mode:** `--parallel` reduces time by ~60%
2. **Category Filtering:** Run only needed tests
3. **Bail Mode:** `--bail` stops on first failure

**Estimated Times:**
- Sequential: ~13s
- Parallel: ~5s
- Single scenario: 1-4s

## 🔧 Configuration Options

### Test Runner
```typescript
new TestRunner({
  verbose: true,          // Detailed output
  bail: false,            // Continue on failure
  timeout: 30000,         // 30s per scenario
  parallel: false,        // Sequential by default
  performanceTarget: 10000, // 10s target
  coverage: false,        // No coverage by default
});
```

### Report Generator
```typescript
new ReportGenerator({
  colors: true,           // ANSI colors
  verbose: false,         // Concise output
  outputDir: "reports",   // Output directory
  timestamp: true,        // Add timestamps
});
```

## 🚀 Next Steps (Task 8 - Final 12.5%)

1. **Create comprehensive README.md**
2. **Update package.json with scripts:**
   ```json
   {
     "scripts": {
       "test:sim": "node tests/simulation/test-runner.ts",
       "test:sim:parallel": "node tests/simulation/test-runner.ts --parallel",
       "test:sim:core": "node tests/simulation/test-runner.ts --category=core",
       "chat:ui": "pwsh tests/simulation/open-chat-ui.ps1"
     }
   }
   ```
3. **Update ARCHITECTURE.md with completion status**
4. **Create CI/CD integration guide**

## 💡 Tips & Best Practices

### For Developers
- Use custom assertions for readable tests
- Run tests in parallel for speed
- Check HTML reports for detailed analysis
- Use Chat UI for manual exploration

### For CI/CD
- Use `--bail` for fast feedback
- Parse JSON output for automation
- Save HTML reports as artifacts
- Set performance targets as gates

### For Testing
- Start with onboarding scenario
- Test personality behaviors separately
- Use stress tests before production
- Validate homestead migration thoroughly

## 📚 Documentation

- **ARCHITECTURE.md** - System design & patterns
- **TASK-4-SUMMARY.md** - AI system details
- **TASK-6-SUMMARY.md** - Assertion framework
- **TASK-7-SUMMARY.md** - Test runner & reporting
- **assertion-examples.spec.ts** - Usage patterns

## 🎉 What's Working

✅ **6-Layer Architecture** - Clean separation of concerns  
✅ **143 Test Cases** - Comprehensive coverage  
✅ **21 Custom Matchers** - Expressive assertions  
✅ **AI Players** - 4 personalities with decision-making  
✅ **Test Runner** - Batch execution with timing  
✅ **4 Report Formats** - Console, JSON, HTML, Markdown  
✅ **Chat UI** - Manual testing interface  
✅ **Zero Compilation Errors** - Production-ready code  

## ❓ Need Help?

1. Check example files in `tests/simulation/examples/`
2. Review TASK summaries for detailed docs
3. Try Chat UI for interactive learning
4. Run tests with `--verbose` for debugging

---

**Framework Status:** 87.5% Complete | **Next:** Documentation (Task 8)
