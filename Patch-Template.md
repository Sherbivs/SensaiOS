# Patch Template
Last Updated (UTC): 2025-10-26T13:45:00Z
Revision: 0.25

Use this template for every submission. Replace placeholders with real content.

````
<<<PATCHSET START>>>
# [Task <ID>] <Concise description>

# FILE: <path/to/file>
```diff
@@
-<old>
+<new>
```

# FILE: <new/file.ts>
```ts
// full contents when adding new files
```

# TASKLIST UPDATE
```diff
@@
-  status: READY
+  status: DONE
```

<<<PATCHSET END>>>

Commit Message

[Task <ID>] <Concise summary>

Why:
- <why this change was needed>

Changes:
- <bullet describing key changes>

Testing:
- <command> (pass/fail + notes)
````

**Rules**
- Emit exactly one PATCHSET block and one Commit Message block.
- Use plain-text sentences in the PATCHSET Echo (inside Prompt.md).
- Keep diffs minimal. Include new files in full.
