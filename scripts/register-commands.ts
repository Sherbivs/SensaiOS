#!/usr/bin/env tsx
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

import { scopedLogger } from '../src/observability/envelope/console.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { printError, printWarning, printSuccess, printInfo, formatSectionHeader, formatKeyValueList } from './lib/output.js';

// Token resolution with fallback chain
const DISCORD_TOKEN: string | undefined =
  process.env.DISCORD_BOT_TOKEN ||
  process.env.POKEMON_BOT_TOKEN ||
  process.env.DISCORD_TOKEN ||
  process.env.SECURITY_BOT_TOKEN ||
  process.env.BOT_TOKEN;

const DISCORD_CLIENT_ID: string | undefined = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID: string | undefined = process.env.DISCORD_GUILD_ID;

const log = scopedLogger('scripts.register-commands');

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  log.error('register', 'Missing Discord credentials', {
    hasToken: Boolean(DISCORD_TOKEN),
    hasClientId: Boolean(DISCORD_CLIENT_ID),
  });
  printError('Missing DISCORD_TOKEN (or SECURITY_BOT_TOKEN/BOT_TOKEN) or DISCORD_CLIENT_ID');
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
    log.warn('register', 'Commands directory not found', {
      path: path.relative(process.cwd(), dir) || 'src/commands',
    });
    printWarning(`Commands directory not found: ${dir}`);
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
      log.warn('register', 'Skipped command module', { file, error: message });
      printWarning(`Skipped ${file}: ${message}`);
    }
  }

  return body;
}

async function main(): Promise<void> {
  console.log(formatSectionHeader('Discord Command Registration'));

  const commands = await readCommandJSON();

  if (commands.length === 0) {
    log.info('register', 'No commands found to register', {
      path: 'src/commands',
    });
    printInfo('No commands found in src/commands');
    process.exit(0);
  }

  console.log(formatKeyValueList([['Commands found', String(commands.length)]]));
  log.info('register', 'Registering commands', {
    count: commands.length,
    target: DISCORD_GUILD_ID ? 'guild' : 'global',
  });

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

  try {
    if (DISCORD_GUILD_ID) {
      printInfo(`Target: Guild ${DISCORD_GUILD_ID}`);
      const route = Routes.applicationGuildCommands(DISCORD_CLIENT_ID!, DISCORD_GUILD_ID);
      await rest.put(route, { body: commands });
      printSuccess(`Registered ${commands.length} guild command(s)`);
      log.info('register', 'Registered guild commands', {
        count: commands.length,
        guildId: DISCORD_GUILD_ID,
      });
    } else {
      printInfo('Target: Global (all guilds)');
      const route = Routes.applicationCommands(DISCORD_CLIENT_ID!);
      await rest.put(route, { body: commands });
      printSuccess(`Registered ${commands.length} global command(s)`);
      printInfo('Note: Global command propagation can take up to an hour');
      log.info('register', 'Registered global commands', {
        count: commands.length,
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('register', 'Failed to register commands', {
      error: message,
      stack: e instanceof Error ? e.stack : undefined,
    });
    printError(`Failed to register commands: ${e}`);
    process.exit(1);
  }
}

main();
