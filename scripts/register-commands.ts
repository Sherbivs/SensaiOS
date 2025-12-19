#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * register-commands.ts - Discord slash command registration
 *
 * PURPOSE:
 *   Register Discord slash commands to a guild or globally.
 *   Uses REST API to push command definitions from src/commands/*.
 *
 * USAGE:
 *   npx tsx scripts/register-commands.ts
 *
 * ENVIRONMENT VARIABLES:
 *   DISCORD_CLIENT_ID - Required: Discord application client ID
 *   DISCORD_BOT_TOKEN, POKEMON_BOT_TOKEN, DISCORD_TOKEN, SECURITY_BOT_TOKEN, or BOT_TOKEN - Required: Bot token
 *   DISCORD_GUILD_ID - Optional: Target guild (omit for global commands)
 *
 * EXIT CODES:
 *   0 - Commands registered successfully
 *   1 - Missing credentials or registration failed
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

// Token resolution with fallback chain
const DISCORD_TOKEN: string | undefined =
  process.env.DISCORD_BOT_TOKEN ||
  process.env.POKEMON_BOT_TOKEN ||
  process.env.DISCORD_TOKEN ||
  process.env.SECURITY_BOT_TOKEN ||
  process.env.BOT_TOKEN;

const DISCORD_CLIENT_ID: string | undefined = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID: string | undefined = process.env.DISCORD_GUILD_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN (or SECURITY_BOT_TOKEN/BOT_TOKEN) or DISCORD_CLIENT_ID');
  process.exit(1);
}

interface CommandModule {
  data?: {
    toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  default?: {
    data?: {
      toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody;
    };
  };
}

/**
 * Read command definitions from src/commands/*.js
 * These are compiled TypeScript commands, so they have .js extension
 */
async function readCommandJSON(): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]> {
  const dir = path.join(process.cwd(), 'src', 'commands');
  if (!fs.existsSync(dir)) {
    console.warn('⚠️  Commands directory not found:', dir);
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

  for (const file of files) {
    try {
      // Dynamic import for ESM compatibility
      const filePath = path.join(dir, file);
      const mod = await import(`file://${filePath.replace(/\\/g, '/')}`) as CommandModule;
      if (mod?.data) {
        body.push(mod.data.toJSON());
      } else if (mod?.default?.data) {
        body.push(mod.default.data.toJSON());
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`⚠️  [register-commands] Skipped ${file}:`, message);
    }
  }

  return body;
}

async function main(): Promise<void> {
  console.log('🔧 Discord Command Registration\n');

  const commands = await readCommandJSON();

  if (commands.length === 0) {
    console.log('📭 No commands found in src/commands');
    process.exit(0);
  }

  console.log(`📋 Found ${commands.length} command(s) to register`);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

  try {
    if (DISCORD_GUILD_ID) {
      console.log(`🎯 Target: Guild ${DISCORD_GUILD_ID}`);
      const route = Routes.applicationGuildCommands(DISCORD_CLIENT_ID!, DISCORD_GUILD_ID);
      await rest.put(route, { body: commands });
      console.log(`✅ Registered ${commands.length} guild command(s)`);
    } else {
      console.log('🌐 Target: Global (all guilds)');
      const route = Routes.applicationCommands(DISCORD_CLIENT_ID!);
      await rest.put(route, { body: commands });
      console.log(`✅ Registered ${commands.length} global command(s)`);
      console.log('⏳ Note: Global command propagation can take up to an hour');
    }
  } catch (e: unknown) {
    console.error('❌ Failed to register commands:', e);
    process.exit(1);
  }
}

main();
