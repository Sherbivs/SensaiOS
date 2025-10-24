# Data Schemas (Stub)

Target datasets and schema outlines:

- Species: id, name, types, base_stats, abilities, moves, sprites
- Moves: id, name, type, category, power, accuracy, pp, effects
- Abilities: id, name, effect
- Type Chart: matrix of effectiveness multipliers
- Manifest: content hash, version, files

Validation approach:
- JSON Schema (Ajv) or Zod
- Minimal unit tests in `tests/` to validate samples
