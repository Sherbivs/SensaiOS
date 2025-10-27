import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

let esmWarningLogged = false;

async function importCommand(filePath) {
  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const mod = await import(moduleUrl);
    return mod?.default ?? mod;
  } catch (error) {
    const message = error?.message || '';
    if (message.includes('Cannot find module') || message.includes('Unexpected token')) {
      throw error;
    }
    try {
      return require(filePath);
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}

async function loadCommands() {
  const dir = path.join(process.cwd(), 'src', 'commands');
  if (!fs.existsSync(dir)) return new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const commands = new Map();
  for (const f of files) {
    const fullPath = path.join(dir, f);
    try {
      const mod = await importCommand(fullPath);
      const command = mod?.default ?? mod;
      const data = command?.data ?? mod?.data;
      const execute = command?.execute ?? mod?.execute;
      if (data?.name && typeof execute === 'function') {
        commands.set(data.name, { ...command, data, execute });
      }
    } catch (err) {
      const message = err?.message || '';
      if (
        (err && typeof err === 'object' && err.code === 'ERR_REQUIRE_ESM') ||
        (typeof message === 'string' && message.includes('require is not defined in ES module scope'))
      ) {
        if (!esmWarningLogged) {
          console.warn('[command-loader] Legacy CommonJS commands detected; skipping slash-command bootstrap.');
          esmWarningLogged = true;
        }
        break;
      }
      console.warn(`[command-loader] Failed to load ${f}:`, message || err);
    }
  }
  return commands;
}

export { loadCommands };

export default { loadCommands };
