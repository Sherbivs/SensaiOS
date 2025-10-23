'use strict';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'cache-bot',
    },
  });

  if (!response.ok) {
    if (attempt < 3 && response.status >= 500) {
      await delay(300 * attempt);
      return fetchJson(url, attempt + 1);
    }

    const text = await response.text().catch(() => '');
    throw new Error(`GET ${url} -> ${response.status} ${text}`);
  }

  return response.json();
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const values = await Promise.all(chunk.map(worker));
    results.push(...values);
    await delay(125);
  }
  return results;
}

async function buildMinimalCache({ limit = 0 } = {}) {
  const listUrl = 'https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0';
  const list = await fetchJson(listUrl);
  let entries = Array.isArray(list.results) ? list.results : [];

  if (limit && Number.isFinite(limit) && limit > 0) {
    entries = entries.slice(0, limit);
  }

  const details = await mapWithConcurrency(entries, 10, async (entry) => {
    const pokemon = await fetchJson(entry.url);
    return {
      id: pokemon.id,
      name: pokemon.name,
      base_experience: pokemon.base_experience,
      height: pokemon.height,
      weight: pokemon.weight,
      types: Array.isArray(pokemon.types) ? pokemon.types.map((type) => type?.type?.name).filter(Boolean) : [],
      stats: Array.isArray(pokemon.stats)
        ? pokemon.stats
        .map((stat) => ({ name: stat?.stat?.name, base: stat?.base_stat }))
        .filter((stat) => stat.name)
        : [],
      abilities: Array.isArray(pokemon.abilities)
        ? pokemon.abilities
        .map((ability) => ({
            name: ability?.ability?.name,
            hidden: ability?.is_hidden,
          }))
        .filter((ability) => ability.name)
        : [],
    };
  });

  details.sort((a, b) => a.id - b.id);

  return {
    generatedAt: new Date().toISOString(),
    count: details.length,
    pokemon: details,
  };
}

module.exports = { buildMinimalCache };
