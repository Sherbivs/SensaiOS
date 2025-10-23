# Discord Auto Role Bot (Trainers)

A simple Discord bot that automatically assigns the "Trainers" role to anyone who joins your server.

## Prerequisites
- Node.js 18+ (recommended)
- A Discord bot token with "Server Members Intent" enabled
- A role named `Trainers` already created in your server

## Local setup

1. Clone or open this project.
2. Create a `.env` file (already included here) and set your token:

   ```env
   BOT_TOKEN=your_discord_bot_token_here
   ```

3. Install dependencies:

   ```powershell
   cd discord-role-bot
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
- Make sure your bot's role is above the `Trainers` role in the server role list so it can assign it.
- The `Trainers` role must exist in the server; otherwise the bot logs a warning and does nothing.

## Deploying on Render
This project works out-of-the-box on Render as a Background Worker:

- Set the Start Command to `npm start` (package.json already provides this).
- Add an environment variable `BOT_TOKEN` with your bot token.
- Ensure your bot has the Server Members Intent enabled in the Developer Portal.

You can also use the optional `render.yaml` provided in this folder to set up the service as code.

## Notes
- The bot listens for `guildMemberAdd` and assigns the `Trainers` role if it exists.
- Uses discord.js v14 with the required `GuildMembers` intent.
