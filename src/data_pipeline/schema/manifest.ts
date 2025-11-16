import { z } from "zod";

export const ManifestSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  counts: z.object({
    species: z.number().int().nonnegative(),
    moves: z.number().int().nonnegative(),
    abilities: z.number().int().nonnegative(),
  }),
});
