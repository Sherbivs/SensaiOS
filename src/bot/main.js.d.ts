import type { Client } from "discord.js";

export declare const client: Client;

export declare function startSecurityBot(options?: { token?: string }): Promise<Client | void>;

declare const securityBot: {
  startSecurityBot: typeof startSecurityBot;
  client: typeof client;
};

export default securityBot;
