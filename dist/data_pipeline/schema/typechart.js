import { z } from "zod";
import { TypeEnum } from "./species.js";
// Effectiveness values: 0 (no effect), 0.5 (not very effective), 1 (neutral), 2 (super effective)
export const Effectiveness = z.number().refine((val) => [0, 0.5, 1, 2].includes(val), {
    message: "Effectiveness must be 0, 0.5, 1, or 2"
});
export const TypeChartSchema = z.record(TypeEnum, z.record(TypeEnum, Effectiveness.optional()).transform((record) => {
    // Fill in missing values with default effectiveness of 1
    const allTypes = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
    const result = {};
    for (const type of allTypes) {
        result[type] = record[type] ?? 1;
    }
    return result;
}));
