import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const require = Module.createRequire(import.meta.url);

const LEGACY_CJS_ERRORS = [
  'module is not defined in ES module scope',
  'require is not defined in ES module scope',
  'exports is not defined in ES module scope',
];

async function loadLegacyCommonJS(filePath) {
  const source = await fsp.readFile(filePath, 'utf8');
  const module = { exports: {} };
  const localRequire = Module.createRequire(filePath);
  const dirname = path.dirname(filePath);
  module.filename = filePath;
  module.paths = Module._nodeModulePaths(dirname);
  module.require = localRequire;
  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${source}\n});`;
  const script = new vm.Script(wrapper, { filename: filePath });
  const compiled = script.runInThisContext();
  compiled(module.exports, localRequire, module, filePath, dirname);
  return module.exports;
}

async function importCommand(filePath) {
  try {
    const moduleUrl = pathToFileURL(filePath).href;
    const mod = await import(moduleUrl);
    return mod?.default ?? mod;
  } catch (error) {
    const message = error?.message || '';
    const legacyCjs = LEGACY_CJS_ERRORS.some((token) => message.includes(token));
    if (legacyCjs) {
      return loadLegacyCommonJS(filePath);
    }
    if (message.includes('Cannot find module') || message.includes('Unexpected token')) {
      throw error;
    }
    try {
      return require(filePath);
    } catch (fallbackError) {
      const fallbackMessage = fallbackError?.message || '';
      if (
        fallbackError?.code === 'ERR_REQUIRE_ESM' ||
        LEGACY_CJS_ERRORS.some((token) => fallbackMessage.includes(token))
      ) {
        return loadLegacyCommonJS(filePath);
      }
      throw fallbackError;
    }
  }
}

async function loadCommands() {
  const dir = path.join(process.cwd(), 'src', 'commands');
  if (!fs.existsSync(dir)) return new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs'));
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
        console.warn(`[command-loader] ${f} must be ESM-compatible:`, message || err);
        continue;
      }
      console.warn(`[command-loader] Failed to load ${f}:`, message || err);
    }
  }
  return commands;
}

export { loadCommands };

export default { loadCommands };
