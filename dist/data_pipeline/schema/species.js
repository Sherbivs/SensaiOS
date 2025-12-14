import { z } from "zod";
export const TypeEnum = z.enum([
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying",
    "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"
]);
export const BaseStats = z.object({
    hp: z.number().int().nonnegative(),
    atk: z.number().int().nonnegative(),
    def: z.number().int().nonnegative(),
    spa: z.number().int().nonnegative(),
    spd: z.number().int().nonnegative(),
    spe: z.number().int().nonnegative(),
});
export const SpeciesSchema = z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    types: z.array(TypeEnum).min(1).max(2),
    baseStats: BaseStats,
    abilities: z.array(z.string()).min(1),
});
