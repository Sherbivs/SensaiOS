'use strict';
import { getPokemon, recordDelta } from '../sync-client.js';

export async function withPokemonCache(command) {
  return async function execute(interaction) {
    const name = interaction.options.getString('pokemon');
    const cached = await getPokemon(name);
    return command({ interaction, cached });
  };
}

export async function trackPokemonAction(userId, action, payload) {
  await recordDelta(userId, action, payload);
}
