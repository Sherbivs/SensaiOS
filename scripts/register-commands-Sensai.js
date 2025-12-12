/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load environment from IG_ENV_FILE if set, otherwise use .env
const envFile = process.env.IG_ENV_FILE || '.env';
if (fs.existsSync(envFile)) {
  config({ path: envFile });
} else {
  console.warn(`[register-commands] Environment file not found: ${envFile}`);
}

import { REST, Routes } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCORD_TOKEN =
  process.env.DISCORD_BOT_TOKEN ||
  process.env.POKEMON_BOT_TOKEN ||
  process.env.DISCORD_TOKEN ||
  process.env.SECURITY_BOT_TOKEN ||
  process.env.BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN (or SECURITY_BOT_TOKEN/BOT_TOKEN) or DISCORD_CLIENT_ID');
  process.exit(1);
}

async function readCommandJSON() {
  const dir = path.join(process.cwd(), 'src', 'commands');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const body = [];
  for (const f of files) {
    try {
      const filePath = path.join(dir, f);
      const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
      const mod = await import(fileUrl);
      if (mod?.data) body.push(mod.data.toJSON());
    } catch (e) {
      console.warn('[register-commands] skipped', f, e?.message || e);
    }
  }
  return body;
}

(async function main() {
  const commands = await readCommandJSON();
  if (!commands.length) {
    console.log('[register-commands] No commands found in src/commands');
    process.exit(0);
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    if (DISCORD_GUILD_ID) {
      const route = Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID);
      await rest.put(route, { body: commands });
      console.log(`Registered ${commands.length} guild commands to ${DISCORD_GUILD_ID}.`);
    } else {
      const route = Routes.applicationCommands(DISCORD_CLIENT_ID);
      await rest.put(route, { body: commands });
      console.log(`Registered ${commands.length} global commands.`);
      console.log('Heads-up: global command propagation can take up to an hour.');
    }
  } catch (e) {
    console.error('Failed to register commands:', e);
    process.exit(1);
  }
})();
