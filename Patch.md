PATCH: POKEAPI DATA STRUCTURE (v2)
SOURCE: https://github.com/PokeAPI/pokeapi
FORMAT: AI-readable schema summary for Pokémon-based games
PURPOSE: Provide structured understanding of the dataset for caching, parsing, and game logic

──────────────────────────────
1. POKÉMON DATA (data/v2/pokemon)
──────────────────────────────
Each Pokémon entry (e.g., /pokemon/charizard.json) contains:
{
  "id": 6,
  "name": "charizard",
  "base_experience": 240,
  "height": 17,
  "weight": 905,
  "stats": [
    {"name": "hp", "base_stat": 78},
    {"name": "attack", "base_stat": 84},
    {"name": "defense", "base_stat": 78},
    {"name": "special-attack", "base_stat": 109},
    {"name": "special-defense", "base_stat": 85},
    {"name": "speed", "base_stat": 100}
  ],
  "types": ["fire", "flying"],
  "abilities": [
    {"name": "blaze", "is_hidden": false},
    {"name": "solar-power", "is_hidden": true}
  ],
  "moves": [
    {"name": "flamethrower", "learn_method": "level-up", "level_learned_at": 54},
    {"name": "fly", "learn_method": "machine"},
    {"name": "dragon-claw", "learn_method": "machine"}
  ],
  "species": "charizard"
}

──────────────────────────────
2. MOVES DATA (data/v2/move)
──────────────────────────────
Example: /move/flamethrower.json
{
  "id": 53,
  "name": "flamethrower",
  "accuracy": 100,
  "power": 90,
  "pp": 15,
  "priority": 0,
  "damage_class": "special",
  "type": "fire",
  "effect_chance": 10,
  "effect_entries": [
    {"short_effect": "May burn the target."}
  ],
  "target": "selected-pokemon"
}

──────────────────────────────
3. SPECIES & EVOLUTION (data/v2/pokemon-species)
──────────────────────────────
{
  "id": 6,
  "name": "charizard",
  "evolves_from_species": "charmeleon",
  "evolution_chain": "/api/v2/evolution-chain/2/",
  "color": "red",
  "habitat": "mountain",
  "growth_rate": "medium-slow",
  "flavor_text_entries": [
    {"language": "en", "version": "sword", "text": "It spits fire that is hot enough to melt boulders."}
  ]
}

──────────────────────────────
4. ABILITIES (data/v2/ability)
──────────────────────────────
{
  "id": 66,
  "name": "blaze",
  "effect_entries": [
    {"effect": "Powers up Fire-type moves when HP is low."}
  ],
  "pokemon": [
    {"name": "charmander"}, {"name": "charmeleon"}, {"name": "charizard"}
  ]
}

──────────────────────────────
5. ITEMS (data/v2/item)
──────────────────────────────
{
  "id": 1,
  "name": "master-ball",
  "cost": 0,
  "effect_entries": [
    {"effect": "Catches any wild Pokémon without fail."}
  ],
  "attributes": ["consumable"],
  "category": "pokeballs"
}

──────────────────────────────
6. TYPE RELATIONS (data/v2/type)
──────────────────────────────
{
  "id": 10,
  "name": "fire",
  "damage_relations": {
    "double_damage_to": ["grass", "ice", "bug", "steel"],
    "half_damage_to": ["fire", "water", "rock", "dragon"],
    "no_damage_to": [],
    "double_damage_from": ["water", "ground", "rock"],
    "half_damage_from": ["fire", "grass", "ice", "bug", "steel", "fairy"],
    "no_damage_from": []
  }
}

──────────────────────────────
7. BERRIES (data/v2/berry)
──────────────────────────────
{
  "id": 1,
  "name": "cheri-berry",
  "natural_gift_power": 60,
  "natural_gift_type": "fire",
  "size": 20,
  "firmness": "soft",
  "flavors": [{"flavor": "spicy", "potency": 10}]
}

──────────────────────────────
8. TRAINERS, LOCATIONS, AND MACHINES
──────────────────────────────
Directories such as /machine, /location, and /encounter hold:
- Machine lists for moves (e.g., TMs and HMs)
- Wild encounter rates
- Region and location metadata for Pokémon availability

──────────────────────────────
9. SCHEMA INTERDEPENDENCE
──────────────────────────────
- Pokémon → species_id links to Pokémon-species.json
- Moves → type_id + effect_id cross-link with type and effect datasets
- Abilities and items can both alter move or stat outcomes
- Each dataset follows a REST structure (`/api/v2/<type>/<id or name>`)

──────────────────────────────
PATCH SUMMARY
──────────────────────────────
Total Pokémon: ~1025
Total Moves: ~900
Total Abilities: ~300
Total Items: ~1100
Latest Game Data: Gen IX (Scarlet/Violet)
Schema Compatibility: JSON REST; AI-parsable; supports caching and offline loading

──────────────────────────────
INSTRUCTIONS FOR LOCAL CACHING
──────────────────────────────
1. Clone main repo → `git clone https://github.com/PokeAPI/pokeapi.git`
2. Sync periodically:
   `git fetch origin master && git reset --hard origin/master`
3. Cache JSON directories locally for high-speed game reads.
4. Access via indexed loader:
   `pokemon_data = json.load(open('/data/pokeapi/data/v2/pokemon/<name>.json'))`

──────────────────────────────
END OF PATCH
──────────────────────────────
