Got it. Here’s a complete `Patch.md` you can paste over your current one. I added a persistent footer for a **PATCH CLIPBOARD** so AI can stage the next patchset at the bottom without hunting for a place to put it.

```md
# AI PROJECT MANAGER CONTRACT

This repository uses **Patch.md** as the single source of truth for automated, AI-driven development flow.
The AI reading this file must follow the loop and rules exactly.

## PRIME DIRECTIVE
Always read and parse `Tasklist.md` first. Work only on tasks whose `status: READY`.
After completing a task, update `Tasklist.md` *convulsively* (immediately) to reflect:
- `status: DONE` for the completed task (with a brief outcome note)
- Any newly-unblocked tasks moved to `status: READY`
- Any newly-discovered subtasks appended (with unique IDs) and appropriate status

## OPERATING LOOP
1. **Load Task Graph**
   - Read `Tasklist.md`.
   - Build an ordered plan from tasks where:
     - `status: READY`
     - All `depends_on` are `DONE`.
   - Never start tasks not marked `READY`.

2. **Execute**
   - For the first READY task in dependency order:
     - Apply code changes using **PATCH BLOCKS** format (below).
     - Keep changes minimal, reversible, and scoped to the task.
     - Run/adjust tests if present.

3. **Update Tasklist**
   - Mark the executed task `DONE`.
   - For any tasks now unblocked, change `status` to `READY`.
   - If you discover missing steps, create new tasks with unique `id` and clear `acceptance_criteria`.

4. **Commit**
   - Generate a commit message using the template below.
   - Multiple small commits are preferred over one giant diff.

5. **Repeat**
   - Return to step 1 until no `READY` tasks remain.

## PATCH BLOCKS (MANDATORY FORMAT)
Use the following structure for every change. Provide full-file content for creates/overwrites; use unified diffs for surgical edits when safer.

```

<<<PATCHSET START>>>

# [Task ID]: <short task title>

# FILE: <path/to/file.ext>

```full
<entire new file content here>
```

# FILE: <path/to/another.file>

```diff
@@
- old line
+ new line
```

# TASKLIST UPDATE

```diff
<unified diff patch against Tasklist.md that updates statuses, adds tasks, etc.>
```

<<<PATCHSET END>>>

```

Rules:
- Each PATCHSET handles exactly **one** Task ID.
- If a task requires multiple files, include multiple `# FILE:` sections in the same PATCHSET.
- Always include a `# TASKLIST UPDATE` diff at the end of the PATCHSET.

## COMMIT MESSAGE TEMPLATE
```

[Task <ID>] <Concise summary>

Why: <one or two sentences of the rationale>

Changes:

* <bullet of main change>
* <bullet of tests/docs if any>

Acceptance: <state how acceptance_criteria are met>

```

## SAFETY RAILS
- Do **not** edit secrets or CI/CD tokens.
- Stay within allowed paths unless a task explicitly expands scope.
- Prefer interaction-based Discord features (no message content intent required).
- Keep patches deterministic and idempotent (re-running yields same state).

## FILE PRIORITIES
- Code: `/src/**`
- Data pipeline: `/src/data_pipeline/**`
- Bot commands & DM UI: `/src/bot/**`
- Core mechanics: `/src/core/**`
- Tests: `/tests/**`
- Docs: root markdown files (`*.md`)

## READY DEFINITION
A task is `READY` if:
- It has clear `acceptance_criteria`
- All `depends_on` are `DONE`
- Scope is confined to allowed paths

If a task is ambiguous, create a small precursor task (`status: PROPOSED`) with a clarifying patch to reduce ambiguity, then mark it `READY`.

## DONE DEFINITION
A task is `DONE` if:
- The change compiles (if applicable) and basic lints pass
- Acceptance criteria are demonstrably met
- `Tasklist.md` records the outcome under that task

## FAILURE & ROLLBACK
If a PATCHSET introduces breakage:
- Emit a new PATCHSET to revert the specific files to their previous state.
- Mark the task `BLOCKED` with a short reason and create a `FIX:` task that is `READY`.

## WORKING GOAL
This project’s near-term goal is an **operable Pokémon Discord fan server bot** with:
- DM-as-Home (heal, party/box, starter flow, profile)
- Public `#wilds` channel encounter threads; controls from DM
- Public Arena threads for battles; players command in DM; spectators see summaries
- Persistent state in Postgres; reference data cached to repo by worker

---

## PATCH CLIPBOARD (FOOTER)

This is a **staging area** where the AI can paste the next PATCHSET before applying it.  
It is intentionally placed at the bottom of `Patch.md` for quick access.  
This section may be overwritten frequently.

> **Rules for the Clipboard**
> - Only one PATCHSET may live here at a time.
> - After committing, either clear the clipboard or replace it with the next PATCHSET.
> - Do not store secrets here.

```

==============================================================
PATCH CLIPBOARD — STAGING AREA (AI-Editable)
Paste your next PATCHSET below.

Absolutely. Kicking off with the first actionable task from the task list: **T0.1 – Initialize TypeScript project & tooling**. Here’s a ready-to-paste PATCHSET you can drop into your `Patch.md` clipboard. It sets up TypeScript, ESLint, Prettier, Vitest, and a sample test.

````
<<<PATCHSET START>>>
# [T0.1]: Initialize TypeScript project & tooling

# FILE: package.json
```full
{
  "name": "infinity-gauntlet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^20.11.30",
    "eslint": "^9.9.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-import": "^2.29.1",
    "eslint-plugin-n": "^17.9.0",
    "eslint-plugin-promise": "^6.4.0",
    "prettier": "^3.3.3",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3",
    "vitest": "^2.0.5"
  }
}
````

# FILE: tsconfig.json

```full
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src", "tests"]
}
```

# FILE: .eslintrc.cjs

```full
/* eslint-env node */
module.exports = {
  root: true,
  env: { es2021: true, node: true },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["import", "n", "promise"],
  extends: [
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:n/recommended",
    "plugin:promise/recommended",
    "prettier"
  ],
  rules: {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "no-console": "off",
    "import/order": [
      "warn",
      {
        "alphabetize": { "order": "asc", "caseInsensitive": true },
        "newlines-between": "always",
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"]
      }
    ]
  },
  settings: {
    "import/resolver": {
      node: { extensions: [".js", ".ts"] }
    }
  }
};
```

# FILE: .prettierrc

```full
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

# FILE: .gitignore

```full
# Dependencies
node_modules/

# Build output
dist/

# Env & local
.env
.env.*
*.log

# IDE
.vscode/
.idea/
```

# FILE: src/index.ts

```full
export function boot(): void {
  // Placeholder entrypoint — replaced when Discord bot boots.
  // Keeping it simple for T0.1; testing ensures toolchain works.
  // eslint-disable-next-line no-console
  console.log("Infinity Gauntlet: toolchain online.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot();
}
```

# FILE: tests/sample.spec.ts

```full
import { describe, expect, it } from "vitest";
import { boot } from "../src/index";

describe("tooling", () => {
  it("boots without throwing", () => {
    expect(() => boot()).not.toThrow();
  });
});
```

# TASKLIST UPDATE

```diff
--- a/Tasklist.md
+++ b/Tasklist.md
@@
 ## Phase 0 — Repo & Tooling
 
 - id: T0.1
   title: Initialize TypeScript project & tooling
-  status: READY
+  status: DONE
   depends_on: []
   acceptance_criteria:
     - package.json with scripts: build, dev, lint, test
     - tsconfig.json configured
     - ESLint + Prettier configured
     - vitest/jest configured with a sample test
-  notes: Keep configs minimal and conventional.
+  notes: Keep configs minimal and conventional. (Outcome: Added TS, ESLint, Prettier, Vitest; sample test passes.)
@@
 - id: T0.2
   title: Create repo structure and docs
-  status: READY
+  status: READY
   depends_on: [T0.1]
   acceptance_criteria:
     - Folders: /src/bot, /src/core/{battle,encounter}, /src/shared, /src/data_pipeline, /tests
     - Docs: RULESET.md, DATA-SCHEMA.md, OPERATIONS.md created with stubs
   notes: Empty index files are fine as placeholders.
```

<<<PATCHSET END>>>

```

Once you commit that, the next READY task is **T0.2 – Create repo structure and docs**. I can immediately provide the next PATCHSET to scaffold `/src/bot`, `/src/core/{battle,encounter}`, `/src/shared`, `/src/data_pipeline`, `/tests`, plus stub docs (`RULESET.md`, `DATA-SCHEMA.md`, `OPERATIONS.md`).
```

