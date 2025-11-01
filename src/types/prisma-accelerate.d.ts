declare module "@prisma/extension-accelerate" {
  export type AccelerateOptions = Record<string, unknown>;

  export function withAccelerate(options?: AccelerateOptions): <Client>(client: Client) => Client;
}
