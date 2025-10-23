# Discord Auto Role Bot (Trainer)

Lightweight Discord bot that auto-assigns the "Trainer" role to new members, with security-focused permission reporting.

## Prerequisites
- Node.js 18+ (recommended)
- A Discord bot token with "Server Members Intent" enabled
- A role named `Trainer` already created in your server (configurable via `ROLE_NAME`)

## Local setup

1. Clone or open this project.
2. Create a `.env` file (already included here) and set your token:

   ```env
   BOT_TOKEN=your_discord_bot_token_here
   ```

3. Install dependencies:

   ```powershell
   npm install
   ```

4. Start the bot:

   ```powershell
   npm start
   ```

If everything is configured, you'll see a log like:

```
✅ Logged in as YourBot#1234
```

## Discord configuration tips
- In the Discord Developer Portal, enable the Privileged Gateway Intent: "Server Members Intent".
- Make sure your bot's role is above the `Trainer` role in the server role list so it can assign it.
- The `Trainer` role must exist in the server; otherwise the bot logs a warning and does nothing.

## Security: Role Permission Persistence Report
- On startup, the bot emits a "Role Permission Persistence" report for each guild.
- It compares the current permissions of the target role to a small on-disk snapshot and reports one of: `MATCH`, `DIFF`, or `NONE`.
- Snapshots are stored as tiny JSON files under `Store/discord-cache`.
- To control snapshot updates:
   - `ROLE_PERMISSION_SNAPSHOT_UPDATE=true` (default): create/update snapshot if missing or different.
   - Set to `false` to make the report read-only (no writes).

### Constant Healing (security enforcement)
- To continuously enforce security:
   - Set `ROLE_PERMISSIONS_REMEDIATE=true` to allow the bot to correct role permission drift.
   - Choose policy via `ROLE_PERMISSION_POLICY`:
      - `snapshot` (default): heal the target role back to the last persisted snapshot.
      - `standard`: heal the target role to a built-in standard for that role name.
   - For member role healing (auto-assign `Trainer` to users with no other roles), enable periodic sweeps with `BACKFILL_INTERVAL_MIN` (e.g., `5`).
   - The bot also listens for `GuildMemberUpdate` and `GuildRoleUpdate` and will reactively heal:
      - If a member ends up with only `@everyone`, it assigns `Trainer`.
      - If the target role’s permissions change, it heals according to policy when remediation is enabled.

Example report lines:

```
[timestamp] [INFO] === Role Permission Persistence ===
      guild: My Server (#123)
      role: Trainer (#456)
      status: MATCH | DIFF | NONE
      currentPermissionsCount: 17
      currentSignature: AttachFiles|EmbedLinks|...
      persistedSignature: AttachFiles|EmbedLinks|...
      lastUpdatedAt: 2025-10-23T00:00:00.000Z
```

## Deploying on Render
This project works out-of-the-box on Render as a Background Worker:

- Set the Start Command to `npm start` (package.json already provides this).
- Add an environment variable `BOT_TOKEN` with your bot token.
- Ensure your bot has the Server Members Intent enabled in the Developer Portal.

You can also use the optional `render.yaml` provided in this folder to set up the service as code.

## Notes
- The bot listens for `guildMemberAdd` and assigns the `Trainer` role if it exists.
- Uses discord.js v14 with the required `GuildMembers` intent.
- Startup backfill of existing members is disabled by default to stay lightweight. Enable only if needed with `STARTUP_BACKFILL=true`.
- Periodic sweeps remain disabled by default; configure with `BACKFILL_INTERVAL_MIN`.
 - For constant permission healing, enable remediation and set the policy (see above).

## Configuration (env)
- `BOT_TOKEN` (required): Discord bot token (raw token, without the `Bot ` prefix).
- `ROLE_NAME` (default: `Trainer`): Target role name (case-insensitive match).
- `ROLE_ID` (optional): Target role ID (takes precedence over name).
- `STARTUP_BACKFILL` (default: `false`): Run a one-time sweep assigning `Trainer` to existing members with no other roles.
- `BACKFILL_CONCURRENCY` (default: `8`): Batch size when sweeping.
- `BACKFILL_DELAY_MS` (default: `20`): Delay between batches in ms.
- `BACKFILL_INTERVAL_MIN` (default: `0`): Enable periodic sweeps by setting to a positive number of minutes.
- `CACHE_TTL_HOURS` (default: `24`): Skip re-assignments recently completed.
- `OPS_REPORT_INTERVAL_MIN` (default: `0`): Emit periodic operational reports.
- `ROLE_PERMISSIONS_AUDIT` (default: `false`): Emit detailed role inventory and diff checks.
- `ROLE_PERMISSIONS_REMEDIATE` (default: `false`): Attempt to update roles to a standard policy (use with caution).
- `ROLE_PERMISSION_SNAPSHOT_UPDATE` (default: `true`): Maintain on-disk permission snapshots for the security report.
 - `ROLE_PERMISSION_POLICY` (default: `snapshot`): Policy for healing target role permissions (`snapshot` or `standard`).
 - `STANDARD_ENFORCE_ALL` (default: `false`): When `true` and policy is `standard`, enforce the standard on ALL roles, not just the target.
 - `UNLISTED_PERMISSIONS` (default: empty): Comma-separated permissions to apply as the default standard for roles not explicitly listed (used only when `STANDARD_ENFORCE_ALL=true` and policy=`standard`). Example: `UNLISTED_PERMISSIONS=SendMessages,ReadMessageHistory`.

## Integration checklist
1) Copy `.env.example` to `.env` and set BOT_TOKEN
2) Ensure the `Store/discord-cache` directory is writable by the process (created automatically on first write)
3) Run `npm install`
4) Start with `npm start`
5) Optional maintenance: the cache auto-prunes to ~25% of approx free space and cleans files older than 7 days
