import type { PrismaClient } from "@prisma/client";

declare module "@prisma/extension-optimize" {
  type OptimizeOptions = {
    apiKey: string;
  };

  export function withOptimize(options: OptimizeOptions): unknown;
}
