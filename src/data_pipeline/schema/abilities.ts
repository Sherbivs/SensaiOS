import { z } from "zod";

export const AbilitySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().min(1),
});
