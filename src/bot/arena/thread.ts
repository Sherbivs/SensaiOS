import type { GuildTextBasedChannel, ThreadChannel } from "discord.js";

export type ArenaThreadContext = {
  battleId: string;
  challengerTag: string;
  opponentTag: string;
  autoArchiveMinutes?: number;
};

export type ThreadCreateResult = ThreadChannel | { id: string; send: (content: string) => Promise<unknown> } | null;

type ThreadCreateArgs = {
  name: string;
  autoArchiveDuration: number;
  reason: string;
};

type ThreadCapableChannel = Pick<GuildTextBasedChannel, "threads"> & {
  send?: (content: string) => Promise<unknown>;
};

type ThreadCreator = (args: ThreadCreateArgs) => Promise<ThreadCreateResult>;

type ThreadManager = {
  create?: ThreadCreator;
};

function buildThreadName({ challengerTag, opponentTag }: ArenaThreadContext) {
  return `Arena: ${challengerTag} vs ${opponentTag}`;
}

export function buildArenaIntro({ battleId, challengerTag, opponentTag }: ArenaThreadContext) {
  return [
    "⚔️ **Battle Started!**",
    `• Challenger: ${challengerTag}`,
    `• Opponent: ${opponentTag}`,
    `• Battle ID: ${battleId}`,
  ].join("\n");
}

/**
 * Creates an arena thread for a pending battle. Returns the created thread (if any).
 * The implementation is defensive to play nicely with mocked channel/thread objects in tests.
 */
export async function createArenaThread(
  channel: ThreadCapableChannel,
  ctx: ArenaThreadContext
): Promise<ThreadCreateResult> {
  const threads = channel?.threads as ThreadManager | undefined;
  const create = threads?.create;
  if (!create) {
    return null;
  }

  const name = buildThreadName(ctx);
  const autoArchiveDuration = ctx.autoArchiveMinutes ?? 60;
  const reason = `Battle ${ctx.battleId}`;

  const thread = await create({ name, autoArchiveDuration, reason });
  if (!thread) {
    return null;
  }

  const intro = buildArenaIntro(ctx);
  try {
    if (typeof thread.send === "function") {
      await thread.send(intro);
    }
  } catch {
    // If the send fails we still return the thread; callers can decide next steps.
  }

  return thread;
}
