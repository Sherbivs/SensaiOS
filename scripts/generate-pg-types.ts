/**
 * Prisma Schema → TypeScript Types Generator
 * 
 * Extracts all models from schema.prisma and generates equivalent TypeScript interfaces.
 * Handles:
 * - Base model types (19 models)
 * - Relation types (WithXYZ patterns)
 * - Enum types
 * - Nullable fields
 * - Date conversions
 * 
 * Output: src/types/db-models.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { formatSectionHeader, formatKeyValueList, printSuccess, printError, printInfo } from '../src/utils/output-formatter.js';

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_PATH = path.join(process.cwd(), 'prisma', 'schema.prisma');
const OUTPUT_PATH = path.join(process.cwd(), 'src', 'types', 'db-models.ts');

// ============================================================================
// Type Mappings
// ============================================================================

const PRISMA_TO_TS_TYPE: Record<string, string> = {
  'String': 'string',
  'Int': 'number',
  'BigInt': 'bigint',
  'Float': 'number',
  'Boolean': 'boolean',
  'DateTime': 'Date',
  'Json': 'any',
  'Bytes': 'Buffer',
};

// ============================================================================
// Parser
// ============================================================================

interface Field {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  isRelation: boolean;
}

interface Model {
  name: string;
  fields: Field[];
}

interface Enum {
  name: string;
  values: string[];
}

function parseSchema(schemaContent: string): { models: Model[]; enums: Enum[] } {
  const models: Model[] = [];
  const enums: Enum[] = [];

  // Parse enums
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let enumMatch;
  while ((enumMatch = enumRegex.exec(schemaContent)) !== null) {
    const name = enumMatch[1];
    const values = enumMatch[2]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'))
      .map(line => line.split(/\s+/)[0]);
    
    enums.push({ name, values });
  }

  // Parse models (handle nested braces properly)
  const lines = schemaContent.split('\n');
  let currentModel: { name: string; lines: string[] } | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Start of model
    const modelStart = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelStart && braceDepth === 0) {
      currentModel = { name: modelStart[1], lines: [] };
      braceDepth = 1;
      continue;
    }

    // Inside model
    if (currentModel && braceDepth > 0) {
      // Count braces
      for (const char of trimmed) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      // End of model
      if (braceDepth === 0) {
        // Parse fields
        const fields: Field[] = [];
        for (const fieldLine of currentModel.lines) {
          const ft = fieldLine.trim();
          
          // Skip comments, empty lines, and attributes
          if (!ft || ft.startsWith('//') || ft.startsWith('@@')) {
            continue;
          }

          // Remove inline comments
          const withoutComment = ft.split('//')[0].trim();
          if (!withoutComment) continue;

          // Parse field: name type modifiers
          const fieldMatch = withoutComment.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
          if (!fieldMatch) continue;

          const [, fieldName, fieldType, arrayModifier, optionalModifier] = fieldMatch;

          // Skip attributes like @id, @default, etc.
          if (fieldName.startsWith('@')) continue;

          // Check if it's a relation (type is a model name)
          const isRelation = !PRISMA_TO_TS_TYPE[fieldType] && !enums.some(e => e.name === fieldType);

          fields.push({
            name: fieldName,
            type: fieldType,
            isOptional: !!optionalModifier,
            isArray: !!arrayModifier,
            isRelation,
          });
        }

        models.push({ name: currentModel.name, fields });
        currentModel = null;
      } else {
        // Add line to current model
        currentModel.lines.push(line);
      }
    }
  }

  return { models, enums };
}

// ============================================================================
// Generator
// ============================================================================

function generateEnumTypes(enums: Enum[]): string {
  const lines: string[] = [];

  lines.push('// ============================================================================');
  lines.push('// Enums');
  lines.push('// ============================================================================');
  lines.push('');

  for (const enumDef of enums) {
    lines.push(`export enum ${enumDef.name} {`);
    for (const value of enumDef.values) {
      lines.push(`  ${value} = "${value}",`);
    }
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

function mapPrismaTypeToTs(field: Field, enumNames: string[]): string {
  // Handle arrays
  const suffix = field.isArray ? '[]' : '';
  const nullable = field.isOptional ? ' | null' : '';

  // Enum type
  if (enumNames.includes(field.type)) {
    return `${field.type}${suffix}${nullable}`;
  }

  // Relation (skip for base interfaces)
  if (field.isRelation) {
    return '';
  }

  // Primitive type
  const tsType = PRISMA_TO_TS_TYPE[field.type] || 'any';
  return `${tsType}${suffix}${nullable}`;
}

function generateModelInterface(model: Model, enumNames: string[]): string {
  const lines: string[] = [];

  lines.push(`export interface ${model.name} {`);

  for (const field of model.fields) {
    // Skip relations in base interface
    if (field.isRelation) continue;

    const tsType = mapPrismaTypeToTs(field, enumNames);
    if (!tsType) continue;

    lines.push(`  ${field.name}: ${tsType};`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateRelationTypes(models: Model[]): string {
  const lines: string[] = [];

  lines.push('// ============================================================================');
  lines.push('// Relation Types (Common Patterns)');
  lines.push('// ============================================================================');
  lines.push('');

  // Common patterns extracted from codebase analysis
  const relationPatterns: Array<{ name: string; base: string; includes: string[] }> = [
    { name: 'UserWithParty', base: 'User', includes: ['parties'] },
    { name: 'UserWithPokemon', base: 'User', includes: ['pokemon'] },
    { name: 'UserWithEncounters', base: 'User', includes: ['encounters'] },
    { name: 'UserWithBattles', base: 'User', includes: ['battlesP1', 'battlesP2'] },
    { name: 'PartyWithSlots', base: 'Party', includes: ['slots'] },
    { name: 'PartySlotWithPokemon', base: 'PartySlot', includes: ['pokemon'] },
    { name: 'PokemonInstanceWithSpecies', base: 'PokemonInstance', includes: ['species'] },
    { name: 'EncounterWithSpecies', base: 'Encounter', includes: ['species'] },
    { name: 'EncounterWithOwner', base: 'Encounter', includes: ['owner'] },
    { name: 'BattleWithPlayers', base: 'Battle', includes: ['p1', 'p2'] },
    { name: 'SpeciesWithTypes', base: 'Species', includes: ['types'] },
    { name: 'SpeciesWithAbilities', base: 'Species', includes: ['abilities'] },
    { name: 'SpeciesWithLearnset', base: 'Species', includes: ['learnset'] },
  ];

  for (const pattern of relationPatterns) {
    const baseModel = models.find(m => m.name === pattern.base);
    if (!baseModel) continue;

    lines.push(`export interface ${pattern.name} extends ${pattern.base} {`);

    for (const include of pattern.includes) {
      const field = baseModel.fields.find(f => f.name === include);
      if (!field) continue;

      const relationType = field.isArray ? `${field.type}[]` : field.type;
      const nullable = field.isOptional ? ' | null' : '';
      lines.push(`  ${include}: ${relationType}${nullable};`);
    }

    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

function generatePickTypes(models: Model[]): string {
  const lines: string[] = [];

  lines.push('// ============================================================================');
  lines.push('// Common Pick Types (Partial Selects)');
  lines.push('// ============================================================================');
  lines.push('');

  // Common selection patterns from codebase
  const pickPatterns = [
    { model: 'User', name: 'UserIdOnly', fields: ['id'] },
    { model: 'User', name: 'UserWithCoins', fields: ['id', 'discordId', 'coins'] },
    { model: 'User', name: 'UserSummary', fields: ['id', 'discordId', 'coins', 'createdAt'] },
    { model: 'PokemonInstance', name: 'PokemonSummary', fields: ['id', 'speciesId', 'level', 'hp', 'maxHp', 'nickname'] },
    { model: 'Battle', name: 'BattleIdOnly', fields: ['id'] },
    { model: 'Encounter', name: 'EncounterSummary', fields: ['id', 'speciesId', 'level', 'state'] },
  ];

  for (const pattern of pickPatterns) {
    const fields = pattern.fields.map(f => `'${f}'`).join(' | ');
    lines.push(`export type ${pattern.name} = Pick<${pattern.model}, ${fields}>;`);
  }

  lines.push('');

  return lines.join('\n');
}

function generateTypeFile(models: Model[], enums: Enum[]): string {
  const lines: string[] = [];

  // Header
  lines.push('/**');
  lines.push(' * Database Model Types');
  lines.push(' * ');
  lines.push(' * Auto-generated from prisma/schema.prisma');
  lines.push(' * DO NOT EDIT MANUALLY');
  lines.push(' * ');
  lines.push(' * Run: npm run generate:types');
  lines.push(' */');
  lines.push('');

  // Enums
  lines.push(generateEnumTypes(enums));

  // Base Models
  lines.push('// ============================================================================');
  lines.push('// Base Models');
  lines.push('// ============================================================================');
  lines.push('');

  const enumNames = enums.map(e => e.name);
  for (const model of models) {
    lines.push(generateModelInterface(model, enumNames));
  }

  // Relation Types
  lines.push(generateRelationTypes(models));

  // Pick Types
  lines.push(generatePickTypes(models));

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(formatSectionHeader('Generate PG Types'));
  printInfo(`Reading schema from: ${SCHEMA_PATH}`);

  // Read schema
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');

  // Parse
  printInfo('Parsing schema...');
  const { models, enums } = parseSchema(schemaContent);

  console.log(formatKeyValueList([['Models found', String(models.length)], ['Enums found', String(enums.length)]]));

  // Generate TypeScript
  printInfo('Generating TypeScript types...');
  const output = generateTypeFile(models, enums);

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');

  printSuccess(`Types written to: ${OUTPUT_PATH}`);
  console.log(formatKeyValueList([
    ['Enums', String(enums.length)],
    ['Base models', String(models.length)],
    ['Relation types', '13 (WithXYZ patterns)'],
    ['Pick types', '6 (partial selects)'],
  ]));
}

main().catch(error => {
  printError(`Error: ${error}`);
  process.exit(1);
});
