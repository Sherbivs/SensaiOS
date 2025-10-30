# Secrets Directory (Local Only)

This folder remains gitignored. Store real credentials in files that mirror the `*.example` templates and keep them outside of commits. Suggested pattern:

1. Copy the example file to a secure location (e.g., `C:/Users/<you>/OneDrive/Documents/Key/Dev/.env` for Dev and `C:/Users/<you>/OneDrive/Documents/Key/Prod/.env` for Prod/Accelerate).
2. Update the secrets.
3. Point `IG_ENV_FILE` (or the helper scripts) to that secure path so agents and local runs load it automatically.

Tracked templates:
- `prisma-accelerate.env.example`
- `prisma-dev.env.example`

Never commit the files without the `.example` suffix. Rotate any leaked tokens immediately.
