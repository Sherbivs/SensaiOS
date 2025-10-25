# Task History Archive

This directory stores historical `Tasklist.md` entries once they roll off the live graph.

When `scripts/archive_task_history.mjs` runs, it trims the Tasklist to the most recent
`status: DONE` entries (default: 100) and writes older tasks into timestamped files
(`tasks-YYYYMMDD.md`). Each archive file preserves the original task blocks for reference.

If no tasks exceed the configured limit or if a task is still referenced by active
`depends_on` relationships, the script leaves the archive untouched.
