import { log } from './utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

// ============================================================================
// Types
// ============================================================================

export interface CommandData {
  name: string;
  description?: string;
  options?: unknown[];
}

export interface Command {
  data: CommandData | SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export type CommandMap = Map<string, Command>;

// ============================================================================
// Module-level state
// ============================================================================

const require = createRequire(import.meta.url);

let esmWarningLogged = false;

// ============================================================================
// Internal helpers
// ============================================================================

async function importCommand(filePath: string): Promise<unknown> {
  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const mod = await import(moduleUrl);
    return mod?.default ?? mod;
  } catch (error) {
    const message = (error as Error)?.message || '';
    if (message.includes('Cannot find module') || message.includes('Unexpected token')) {
      throw error;
    }
    // Fallback to require for CommonJS modules
    return require(filePath);
  }
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Load all slash commands from the commands directory
 * In development: cwd is project root, commands at src/commands
 * In production (Render): cwd is /opt/render/project/src, commands at commands/ (sibling to command-loader.js)
 */
export async function loadCommands(): Promise<CommandMap> {
  // Solution: Check if src/commands exists first (dev), otherwise use commands/ (prod)
  const devPath = path.join(process.cwd(), 'src', 'commands');
  const prodPath = path.join(process.cwd(), 'commands');
  const dir = fs.existsSync(devPath) ? devPath : prodPath;

  if (!fs.existsSync(dir)) {
    log.warn(`[command-loader] Commands directory not found at ${dir}`);
    return new Map();
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const commands: CommandMap = new Map();

  for (const f of files) {
    const fullPath = path.join(dir, f);
    try {
      const mod = await importCommand(fullPath) as Record<string, unknown>;
      const command = (mod?.default ?? mod) as Record<string, unknown>;
      const data = (command?.data ?? mod?.data) as CommandData | SlashCommandBuilder | undefined;
      const execute = (command?.execute ?? mod?.execute) as Command['execute'] | undefined;

      if (data && 'name' in data && typeof execute === 'function') {
        commands.set(data.name, { ...command, data, execute } as Command);
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      const message = error?.message || '';

      if (
        error?.code === 'ERR_REQUIRE_ESM' ||
        (typeof message === 'string' && message.includes('require is not defined in ES module scope'))
      ) {
        if (!esmWarningLogged) {
          log.warn('[command-loader] Legacy CommonJS commands detected; skipping slash-command bootstrap.');
          esmWarningLogged = true;
        }
        break;
      }
      log.warn(`[command-loader] Failed to load ${f}:`, { error: message || String(err) });
    }
  }

  return commands;
}

export default { loadCommands };
