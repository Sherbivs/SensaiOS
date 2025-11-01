import type { Collection } from "discord.js";

declare module "../command-loader.js" {
  export interface CommandModule {
    data: { name: string };
    execute: (...args: unknown[]) => Promise<unknown> | unknown;
    [key: string]: unknown;
  }

  export type LoadedCommands = Collection<string, CommandModule>;

  export function loadCommands(): Promise<LoadedCommands>;

  const commandLoader: {
    loadCommands: typeof loadCommands;
  };

  export default commandLoader;
}
