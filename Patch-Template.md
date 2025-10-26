# Patch Template
Last Updated (UTC): 2025-10-26T14:20:00Z
Revision: 0.26

NEW ENGINE RULES — This template mirrors the legacy layout, obeys the Marker Switch, and forbids fenced code blocks or embedded file objects. Describe changes with plain text sentences.

<<<PATCHSET START>>>
[Task <ID>] <Concise description>

FILE: <path/to/file>
Change: <succinct summary>
Insert/Replace/Remove: <key lines or payload described in prose>

FILE: <new/file.ts>
Change: <why file is added>
Contents: <outline of the full file contents when new>

# TASKLIST UPDATE
Change: <status transitions, new tasks, outcome notes>

<<<PATCHSET END>>>

Commit Message
[Task <ID>] <Concise summary>

Why:
- <why this change was needed>

Changes:
- <bullet describing key changes>

Testing:
- <command> (pass/fail + notes)

Markerless Mode reminder: If the clipboard omits `<<<PATCHSET START>>>`, the run proceeds with contracts OFF, but the Absolutes (canonical files, routers, NEXT pointer) still apply and CI enforces them.
