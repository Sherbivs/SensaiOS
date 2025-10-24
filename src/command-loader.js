'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadCommands() {
  const dir = path.join(process.cwd(), 'src', 'commands');
  if (!fs.existsSync(dir)) return new Map();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const commands = new Map();
  for (const f of files) {
    try {
      const mod = require(path.join(dir, f));
      if (mod?.data?.name && typeof mod.execute === 'function') {
        commands.set(mod.data.name, mod);
      }
    } catch (err) {
      console.warn(`[command-loader] Failed to load ${f}:`, err?.message || err);
    }
  }
  return commands;
}

module.exports = { loadCommands };
