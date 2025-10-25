import { describe, it, expect } from "vitest";
import {
  SpeciesSchema,
  MoveSchema,
  AbilitySchema,
  TypeChartSchema,
  ManifestSchema,
} from "../src/data_pipeline/schema/index.js";

describe("data pipeline schemas", () => {
  it("validates sample species", () => {
    const samples = [
      { id: 1, name: "Bulbasaur", types: ["Grass", "Poison"], baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 }, abilities: ["Overgrow"] },
      { id: 4, name: "Charmander", types: ["Fire"], baseStats: { hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65 }, abilities: ["Blaze"] },
      { id: 7, name: "Squirtle", types: ["Water"], baseStats: { hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43 }, abilities: ["Torrent"] },
    ];
    for (const s of samples) {
      const parsed = SpeciesSchema.parse(s);
      expect(parsed.name.length).toBeGreaterThan(0);
    }
  });

  it("validates sample moves", () => {
    const samples = [
      { id: 33, name: "Tackle", type: "Normal", category: "Physical", power: 40, accuracy: 100, pp: 35 },
      { id: 52, name: "Ember", type: "Fire", category: "Special", power: 40, accuracy: 100, pp: 25 },
      { id: 55, name: "Water Gun", type: "Water", category: "Special", power: 40, accuracy: 100, pp: 25 },
    ];
    for (const m of samples) {
      const parsed = MoveSchema.parse(m);
      expect(parsed.pp).toBeGreaterThan(0);
    }
  });

  it("validates sample abilities", () => {
    const samples = [
      { id: 1, name: "Overgrow", description: "Powers up Grass-type moves in a pinch." },
      { id: 2, name: "Blaze", description: "Powers up Fire-type moves in a pinch." },
      { id: 3, name: "Torrent", description: "Powers up Water-type moves in a pinch." },
    ];
    for (const a of samples) {
      const parsed = AbilitySchema.parse(a);
      expect(parsed.name).toBeTypeOf("string");
    }
  });

  it("validates a minimal type chart", () => {
    const chart = {
      Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5, Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1, Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1, Dragon: 1, Dark: 1, Fairy: 1 },
      Fire:   { Grass: 2, Ice: 2, Bug: 2, Steel: 2, Fire: 0.5, Water: 0.5, Rock: 0.5, Dragon: 0.5, Normal: 1, Electric: 1, Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Ghost: 1, Dark: 1, Fairy: 1 },
      Water:  { Fire: 2, Ground: 2, Rock: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5, Normal: 1, Electric: 1, Ice: 1, Fighting: 1, Poison: 1, Flying: 1, Psychic: 1, Bug: 1, Ghost: 1, Dark: 1, Steel: 1, Fairy: 1 },
      Electric: { Water: 2, Flying: 2, Electric: 0.5, Grass: 0.5, Dragon: 0.5, Ground: 0, Normal: 1, Fire: 1, Ice: 1, Fighting: 1, Poison: 1, Rock: 1, Psychic: 1, Bug: 1, Ghost: 1, Dark: 1, Steel: 1, Fairy: 1 },
      Grass:  { Water: 2, Ground: 2, Rock: 2, Fire: 0.5, Grass: 0.5, Poison: 0.5, Flying: 0.5, Bug: 0.5, Dragon: 0.5, Steel: 0.5, Normal: 1, Electric: 1, Ice: 1, Fighting: 1, Psychic: 1, Ghost: 1, Dark: 1, Fairy: 1 },
      Ice:    { Grass: 2, Ground: 2, Flying: 2, Dragon: 2, Fire: 0.5, Water: 0.5, Ice: 0.5, Steel: 0.5, Normal: 1, Electric: 1, Fighting: 1, Poison: 1, Rock: 1, Psychic: 1, Bug: 1, Ghost: 1, Dark: 1, Fairy: 1 },
      Fighting: { Normal: 2, Ice: 2, Rock: 2, Dark: 2, Steel: 2, Ghost: 0, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Fairy: 0.5, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ground: 1, Dragon: 1 },
      Poison:   { Grass: 2, Fairy: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Normal: 1, Fire: 1, Water: 1, Electric: 1, Ice: 1, Flying: 1, Psychic: 1, Bug: 1, Dragon: 1, Dark: 1 },
      Ground:   { Fire: 2, Electric: 2, Poison: 2, Rock: 2, Steel: 2, Grass: 0.5, Bug: 0.5, Flying: 0, Normal: 1, Water: 1, Ice: 1, Fighting: 1, Psychic: 1, Ghost: 1, Dragon: 1, Dark: 1, Fairy: 1 },
      Flying:   { Grass: 2, Fighting: 2, Bug: 2, Electric: 0.5, Rock: 0.5, Steel: 0.5, Normal: 1, Fire: 1, Water: 1, Ice: 1, Poison: 1, Ground: 1, Psychic: 1, Ghost: 1, Dragon: 1, Dark: 1, Fairy: 1 },
      Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Steel: 0.5, Dark: 0, Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1, Ground: 1, Flying: 1, Rock: 1, Bug: 1, Ghost: 1, Dragon: 1, Fairy: 1 },
      Bug:      { Grass: 2, Psychic: 2, Dark: 2, Fire: 0.5, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Ghost: 0.5, Steel: 0.5, Fairy: 0.5, Normal: 1, Water: 1, Electric: 1, Ice: 1, Ground: 1, Rock: 1, Dragon: 1 },
      Rock:     { Fire: 2, Ice: 2, Flying: 2, Bug: 2, Fighting: 0.5, Ground: 0.5, Steel: 0.5, Normal: 1, Water: 1, Electric: 1, Grass: 1, Psychic: 1, Poison: 1, Ghost: 1, Dragon: 1, Dark: 1, Fairy: 1 },
      Ghost:    { Psychic: 2, Ghost: 2, Normal: 0, Dark: 0.5, Steel: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1, Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Rock: 1, Bug: 1, Dragon: 1, Fairy: 1 },
      Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0, Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1, Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1, Rock: 1, Ghost: 1, Dark: 1 },
      Dark:     { Psychic: 2, Ghost: 2, Fighting: 0.5, Dark: 0.5, Fairy: 0.5, Normal: 1, Fire: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1, Poison: 1, Ground: 1, Flying: 1, Rock: 1, Bug: 1, Dragon: 1, Steel: 1 },
      Steel:    { Rock: 2, Ice: 2, Fairy: 2, Fire: 0.5, Water: 0.5, Electric: 0.5, Steel: 0.5, Normal: 1, Grass: 1, Fighting: 1, Poison: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1, Ghost: 1, Dragon: 1, Dark: 1 },
      Fairy:    { Fighting: 2, Dragon: 2, Dark: 2, Fire: 0.5, Poison: 0.5, Steel: 0.5, Normal: 1, Water: 1, Electric: 1, Grass: 1, Ice: 1, Ground: 1, Flying: 1, Psychic: 1, Bug: 1, Rock: 1, Ghost: 1 },
    } as const;
    expect(() => TypeChartSchema.parse(chart)).not.toThrow();
  });

  it("validates a manifest", () => {
    const manifest = {
      version: "2025-10-25",
      updatedAt: new Date().toISOString(),
      counts: { species: 3, moves: 3, abilities: 3 },
    };
    expect(() => ManifestSchema.parse(manifest)).not.toThrow();
  });
});
