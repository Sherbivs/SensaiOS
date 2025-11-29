/**
 * Discord.js Mock Infrastructure
 * 
 * Comprehensive mocks for Discord.js objects to simulate bot interactions
 * without requiring a real Discord bot deployment.
 * 
 * NOTE: These are simplified mocks that don't strictly implement Discord.js types.
 * They provide enough functionality for testing game logic without full Discord.js complexity.
 * 
 * @module tests/simulation/mocks/discord-mocks
 */

import { EventEmitter } from "events";

/**
 * Mock Discord User
 */
export class MockUser extends EventEmitter {
  id: string;
  username: string;
  discriminator: string;
  tag: string;
  bot: boolean;
  system: boolean;
  
  constructor(id: string, username: string) {
    super();
    this.id = id;
    this.username = username;
    this.discriminator = "0001";
    this.tag = `${username}#${this.discriminator}`;
    this.bot = false;
    this.system = false;
  }
  
  toString() {
    return `<@${this.id}>`;
  }
  
  async createDM() {
    throw new Error("createDM() is deprecated - use homestead channels");
  }
}

/**
 * Mock Discord Channel
 */
export class MockChannel extends EventEmitter {
  id: string;
  name: string;
  type: number;
  guildId: string;
  messages: MockMessage[] = [];
  position: number = 0;
  
  constructor(id: string, name: string, guildId: string) {
    super();
    this.id = id;
    this.name = name;
    this.type = 0; // TEXT_CHANNEL
    this.guildId = guildId;
  }
  
  async send(options: any): Promise<MockMessage> {
    const message = new MockMessage(
      this.generateMessageId(),
      options,
      this as any,
      null
    );
    this.messages.push(message);
    this.emit("message", message);
    return message;
  }
  
  async fetch() {
    return this;
  }
  
  async edit(options: any) {
    if (options.name) this.name = options.name;
    return this;
  }
  
  async delete() {
    this.emit("delete");
  }
  
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  
  isTextBased(): boolean {
    return true;
  }
}

/**
 * Mock Discord Message
 */
export class MockMessage extends EventEmitter {
  id: string;
  content: string;
  embeds: any[];
  components: any[];
  author: MockUser | null;
  channel: MockChannel;
  reactions: Map<string, number> = new Map();
  
  constructor(
    id: string,
    options: any,
    channel: MockChannel,
    author: MockUser | null
  ) {
    super();
    this.id = id;
    this.channel = channel;
    this.author = author;
    
    if (typeof options === "string") {
      this.content = options;
      this.embeds = [];
      this.components = [];
    } else {
      this.content = options.content || "";
      this.embeds = options.embeds || [];
      this.components = options.components || [];
    }
  }
  
  async edit(options: any) {
    if (typeof options === "string") {
      this.content = options;
    } else {
      this.content = options.content || this.content;
      this.embeds = options.embeds || this.embeds;
      this.components = options.components || this.components;
    }
    return this;
  }
  
  async delete() {
    const index = this.channel.messages.indexOf(this);
    if (index > -1) {
      this.channel.messages.splice(index, 1);
    }
  }
  
  async react(emoji: string) {
    const count = this.reactions.get(emoji) || 0;
    this.reactions.set(emoji, count + 1);
  }
}

/**
 * Mock Command Interaction
 */
export class MockCommandInteraction extends EventEmitter {
  id: string;
  commandName: string;
  user: MockUser;
  guildId: string;
  channelId: string;
  client: MockClient;
  replied: boolean = false;
  deferred: boolean = false;
  ephemeral: boolean = false;
  customId?: string;
  
  private _response: any = null;
  private _followUps: any[] = [];
  
  constructor(
    commandName: string,
    user: MockUser,
    guild: MockGuild,
    channel: MockChannel,
    client: MockClient,
    options: any = {}
  ) {
    super();
    this.id = `interaction-${Date.now()}`;
    this.commandName = commandName;
    this.user = user;
    this.guildId = guild.id;
    this.channelId = channel.id;
    this.client = client;
    this.customId = options.customId;
  }
  
  get options(): any {
    return {
      getString: (_name: string) => null,
      getUser: (_name: string) => null,
      getInteger: (_name: string) => null,
      getBoolean: (_name: string) => null,
    };
  }
  
  async reply(options: any) {
    this.replied = true;
    if (typeof options === "object" && options.ephemeral) {
      this.ephemeral = true;
    }
    this._response = options;
    return this;
  }
  
  async editReply(options: any) {
    this._response = options;
    return this;
  }
  
  async deferReply(options?: any) {
    this.deferred = true;
    if (options?.ephemeral) {
      this.ephemeral = true;
    }
  }
  
  async followUp(options: any) {
    this._followUps.push(options);
    return this;
  }
  
  async update(options: any) {
    this._response = options;
    return this;
  }
  
  inGuild(): boolean {
    return !!this.guildId;
  }
  
  getResponse() {
    return this._response;
  }
  
  getFollowUps() {
    return this._followUps;
  }
}

/**
 * Mock Button Interaction
 */
export class MockButtonInteraction extends MockCommandInteraction {
  customId: string;
  componentType: number = 2; // BUTTON
  
  constructor(
    customId: string,
    user: MockUser,
    guild: MockGuild,
    channel: MockChannel,
    client: MockClient
  ) {
    super("", user, guild, channel, client, { customId });
    this.customId = customId;
  }
}

/**
 * Mock Guild Member
 */
export class MockGuildMember {
  id: string;
  user: MockUser;
  guild: MockGuild;
  roles: any;
  
  constructor(user: MockUser, guild: MockGuild) {
    this.id = user.id;
    this.user = user;
    this.guild = guild;
    this.roles = {
      cache: new Map(),
      add: async (_role: any) => {},
      remove: async (_role: any) => {},
    };
  }
}

/**
 * Mock Discord Guild
 */
export class MockGuild extends EventEmitter {
  id: string;
  name: string;
  channels: Map<string, MockChannel> = new Map();
  members: Map<string, MockGuildMember> = new Map();
  
  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
  }
  
  get channelsManager() {
    return {
      create: async (options: any) => {
        const channel = new MockChannel(
          this.generateChannelId(),
          options.name,
          this.id
        );
        this.channels.set(channel.id, channel);
        this.emit("channelCreate", channel);
        return channel;
      },
      fetch: async (id: string) => {
        return this.channels.get(id);
      },
      cache: {
        find: (predicate: (ch: MockChannel) => boolean) => {
          return Array.from(this.channels.values()).find(predicate);
        },
        filter: (predicate: (ch: MockChannel) => boolean) => {
          return new Map(
            Array.from(this.channels.entries()).filter(([_, ch]) =>
              predicate(ch)
            )
          );
        },
      },
    };
  }
  
  async fetch() {
    return this;
  }
  
  private generateChannelId(): string {
    return `channel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Mock Discord Client
 */
export class MockClient extends EventEmitter {
  user: MockUser | null = null;
  guilds: Map<string, MockGuild> = new Map();
  users: Map<string, MockUser> = new Map();
  isReady: boolean = false;
  
  constructor() {
    super();
  }
  
  async login(token: string) {
    this.user = new MockUser("bot-123", "TestBot");
    this.isReady = true;
    this.emit("ready");
    return token;
  }
  
  get guildsManager() {
    return {
      fetch: async (id: string) => {
        return this.guilds.get(id);
      },
      cache: this.guilds,
    };
  }
  
  get usersManager() {
    return {
      fetch: async (id: string) => {
        return this.users.get(id);
      },
      cache: this.users,
    };
  }
  
  get channelsManager() {
    return {
      fetch: async (id: string) => {
        for (const guild of this.guilds.values()) {
          const channel = guild.channels.get(id);
          if (channel) return channel;
        }
        return null;
      },
    };
  }
  
  // Helper methods for testing
  createGuild(name: string): MockGuild {
    const guild = new MockGuild(
      `guild-${Date.now()}`,
      name
    );
    this.guilds.set(guild.id, guild);
    return guild;
  }
  
  createUser(username: string): MockUser {
    const user = new MockUser(
      `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      username
    );
    this.users.set(user.id, user);
    return user;
  }
  
  async emitCommand(
    commandName: string,
    user: MockUser,
    guild: MockGuild,
    channel: MockChannel,
    options: any = {}
  ): Promise<MockCommandInteraction> {
    const interaction = new MockCommandInteraction(
      commandName,
      user,
      guild,
      channel,
      this,
      options
    );
    this.emit("interactionCreate", interaction);
    return interaction;
  }
  
  async emitButton(
    customId: string,
    user: MockUser,
    guild: MockGuild,
    channel: MockChannel
  ): Promise<MockButtonInteraction> {
    const interaction = new MockButtonInteraction(
      customId,
      user,
      guild,
      channel,
      this
    );
    this.emit("interactionCreate", interaction);
    return interaction;
  }
}

/**
 * Factory function to create a complete mock Discord environment
 */
export function createMockDiscordEnvironment(guildName: string = "Test Guild") {
  const client = new MockClient();
  const guild = client.createGuild(guildName);
  
  // Create some default channels
  const generalChannel = new MockChannel("channel-general", "general", guild.id);
  guild.channels.set(generalChannel.id, generalChannel);
  
  return {
    client,
    guild,
    generalChannel,
    createUser: (username: string) => client.createUser(username),
  };
}
