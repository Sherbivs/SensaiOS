import { log } from './utils/logger.js';
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
    // Fallback to require for CommonJS modules
    return require(filePath);
  }
}

async function loadCommands() {
  // Path resolution strategy:
  // 1. dist/commands (production compiled output)
  // 2. src/commands (development source - for tsx/ts-node)
  // 3. commands/ (legacy fallback - adjacent to command-loader.js)
  //
  // On Render: cwd is /opt/render/project/src (repo root)
  //   - dist/commands contains compiled JS (CORRECT for production)
  //   - src/commands contains source JS/TS (WRONG - imports won't resolve)
  const distPath = path.join(process.cwd(), 'dist', 'commands');
  const devPath = path.join(process.cwd(), 'src', 'commands');
  const legacyPath = path.join(process.cwd(), 'commands');
  
  // Prefer dist/ in production, src/ in development
  let dir;
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    dir = distPath;
  } else if (fs.existsSync(devPath)) {
    dir = devPath;
  } else if (fs.existsSync(distPath)) {
    dir = distPath;
  } else {
    dir = legacyPath;
  }
  
  if (!fs.existsSync(dir)) {
    log('warn', `[command-loader] Commands directory not found at ${dir}`);
    return new Map();
  }
  
  log('info', `[command-loader] Loading commands from ${dir}`);
  
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
          log.warn('[command-loader] Legacy CommonJS commands detected; skipping slash-command bootstrap.');
          esmWarningLogged = true;
        }
        break;
      }
      log('warn', '[command-loader] Failed to load command', {
        file: f,
        message: message || err,
        code: err?.code,
        stack: err?.stack,
      });
    }
  }
  return commands;
}

export { loadCommands };

export default { loadCommands };
