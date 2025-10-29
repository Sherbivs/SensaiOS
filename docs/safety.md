# Safety
- Never output secrets. Mask tokens. Redact credentials in logs.
- Use dry-run for shell/DB until reviewer approval.
- DB matview refresh via SECURITY DEFINER or ownership; never grant blanket superuser.
- RLS: if enabled, policies must allow the app role to read/write.
