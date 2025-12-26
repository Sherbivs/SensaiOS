// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from './shared/logging/index.js';
const logger = getLogger();
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// ============================================================================
// Module-level state
// ============================================================================
const require = createRequire(import.meta.url);
let esmWarningLogged = false;
// ============================================================================
// Internal helpers
// ============================================================================
async function importCommand(filePath) {
    try {
        const moduleUrl = pathToFileURL(filePath).href;
        const mod = await import(moduleUrl);
        return mod?.default ?? mod;
    }
    catch (error) {
        const message = error?.message || '';
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
export async function loadCommands() {
    // Solution: Check if src/commands exists first (dev), otherwise use commands/ (prod)
    const devPath = path.join(process.cwd(), 'src', 'commands');
    const prodPath = path.join(process.cwd(), 'commands');
    const dir = fs.existsSync(devPath) ? devPath : prodPath;
    if (!fs.existsSync(dir)) {
        logger.warn('command-loader', 'loadCommands', 'Commands directory not found', { metadata: { path: dir } });
        return new Map();
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    const commands = new Map();
    for (const f of files) {
        const fullPath = path.join(dir, f);
        try {
            const mod = await importCommand(fullPath);
            const command = (mod?.default ?? mod);
            const data = (command?.data ?? mod?.data);
            const execute = (command?.execute ?? mod?.execute);
            if (data && 'name' in data && typeof execute === 'function') {
                commands.set(data.name, { ...command, data, execute });
            }
        }
        catch (err) {
            const error = err;
            const message = error?.message || '';
            if (error?.code === 'ERR_REQUIRE_ESM' ||
                (typeof message === 'string' && message.includes('require is not defined in ES module scope'))) {
                if (!esmWarningLogged) {
                    logger.warn('command-loader', 'loadCommands', 'Legacy CommonJS commands detected; skipping slash-command bootstrap');
                    esmWarningLogged = true;
                }
                break;
            }
            logger.warn('command-loader', 'loadCommands', `Failed to load ${f}`, { error: { name: error?.name || 'Error', message: message || String(err) } });
        }
    }
    return commands;
}
export default { loadCommands };
