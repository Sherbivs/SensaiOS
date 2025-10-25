import { z } from "zod";
import { TypeEnum } from "./species.js";

// Effectiveness values: 0 (no effect), 0.5 (not very effective), 1 (neutral), 2 (super effective)
export const Effectiveness = z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)]);

export const TypeChartSchema = z.record(
  TypeEnum,
  z.record(TypeEnum, Effectiveness)
);

export type TypeChart = z.infer<typeof TypeChartSchema>;
