import { z } from "zod";
import { TypeEnum } from "./species.js";
export const MoveCategory = z.enum(["Physical", "Special", "Status"]);
export const MoveSchema = z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    type: TypeEnum,
    category: MoveCategory,
    power: z.number().int().nonnegative().nullable(),
    accuracy: z.number().min(0).max(100).nullable(),
    pp: z.number().int().positive(),
});
