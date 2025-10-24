// utils/pokemon-picker.js
// DM-based Pokémon picker with simple collector

const { setUserData } = require('../cache');
const { loadPokemonDataset } = require('./pokemon-data');

function getSelectablePokemon(list) {
  // With current dataset, no stage/starter flags; allow all for now
  return Array.isArray(list) ? list : [];
}

async function promptUserSelection(user) {
  const dataset = loadPokemonDataset();
  const selectable = getSelectablePokemon(dataset);
  if (!selectable.length) return;

  const dm = await user.createDM();
  const top = selectable.slice(0, 10);
  const menu = top.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  await dm.send(`Choose your Pokémon by replying with the number or name within 60 seconds.\n${menu}`);

  const filter = (m) => m.author.id === user.id;
  const collector = dm.createMessageCollector({ filter, max: 1, time: 60_000 });

  return new Promise((resolve) => {
    collector.on('collect', async (m) => {
      const content = m.content.trim();
      let choice = null;
      const num = Number(content);
      if (!Number.isNaN(num) && num >= 1 && num <= top.length) {
        choice = top[num - 1];
      } else {
        choice = selectable.find(p => p.name.toLowerCase() === content.toLowerCase());
      }

      if (choice) {
        const profile = { pokemon: choice, level: 1, xp: 0, hp: choice?.stats?.hp ?? 100, updatedAt: new Date().toISOString() };
        setUserData(user.id, profile);
        await dm.send(`You chose ${choice.name}!`);
        resolve(profile);
      } else {
        await dm.send('Invalid choice. Try again later with !pickpokemon.');
        resolve(null);
      }
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        try { await dm.send('Selection timed out. Try again with !pickpokemon.'); } catch {}
        resolve(null);
      }
    });
  });
}

module.exports = { promptUserSelection };
