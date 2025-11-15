import { randomUUID } from "node:crypto";

export type BattleMoveOption = {
  id: string;
  label: string;
  description?: string;
  remainingPp?: number;
  maxPp?: number;
};

export type BattlePartyMember = {
  id: string;
  label: string;
  hp: number;
  maxHp: number;
  fainted: boolean;
  moves: BattleMoveOption[];
};

type PlayerKey = "p1" | "p2";

type BattleSwitchOption = BattlePartyMember;

type PlayerState = {
  active: BattlePartyMember | null;
  bench: BattlePartyMember[];
};

type BattleQueuedAction =
  | { type: "move"; moveId: string; requestId: string }
  | { type: "switch"; targetId: string; requestId: string };

type ResolvedTurn = {
  turn: number;
  actions: Record<PlayerKey, BattleQueuedAction>;
};

type BattleRuntime = {
  id: string;
  turn: number;
  players: Record<PlayerKey, PlayerState>;
  pending: Partial<Record<PlayerKey, BattleQueuedAction>>;
  history: ResolvedTurn[];
};

export type QueueResult =
  | { status: "queued"; turn: number; action: BattleQueuedAction }
  | { status: "ready"; turn: number; action: BattleQueuedAction; resolved: ResolvedTurn };

const runtimes = new Map<string, BattleRuntime>();

function ensureRuntime(battleId: string): BattleRuntime {
  let runtime = runtimes.get(battleId);
  if (!runtime) {
    runtime = {
      id: battleId,
      turn: 0,
      players: {
        p1: { active: null, bench: [] },
        p2: { active: null, bench: [] },
      },
      pending: {},
      history: [],
    } satisfies BattleRuntime;
    runtimes.set(battleId, runtime);
  }
  return runtime;
}

export function setPlayerState(
  battleId: string,
  player: PlayerKey,
  state: PlayerState
): PlayerState {
  const runtime = ensureRuntime(battleId);
  runtime.players[player] = {
    active: state.active,
    bench: [...state.bench],
  } satisfies PlayerState;
  // Reset pending action when party context changes
  if (runtime.pending[player]) {
    delete runtime.pending[player];
  }
  return runtime.players[player];
}

export function listLegalMoves(battleId: string, player: PlayerKey): BattleMoveOption[] {
  const runtime = ensureRuntime(battleId);
  const active = runtime.players[player]?.active;
  return active ? [...active.moves] : [];
}

export function listSwitchOptions(battleId: string, player: PlayerKey): BattleSwitchOption[] {
  const runtime = ensureRuntime(battleId);
  const state = runtime.players[player];
  if (!state) return [];
  return state.bench.filter((member) => !member.fainted && member.hp > 0);
}

function finalizeTurn(runtime: BattleRuntime): ResolvedTurn {
  const pending = runtime.pending;
  const resolved: ResolvedTurn = {
    turn: runtime.turn + 1,
    actions: {
      p1: pending.p1!,
      p2: pending.p2!,
    },
  } satisfies ResolvedTurn;

  runtime.turn = resolved.turn;
  runtime.history.push(resolved);
  runtime.pending = {};

  for (const key of ["p1", "p2"] as const) {
    const action = resolved.actions[key];
    if (action.type === "switch") {
      applySwitch(runtime, key, action.targetId);
    }
  }

  return resolved;
}

function applySwitch(runtime: BattleRuntime, player: PlayerKey, targetId: string): void {
  const state = runtime.players[player];
  if (!state) return;
  const benchIndex = state.bench.findIndex((member) => member.id === targetId);
  if (benchIndex === -1) return;

  const nextActive = state.bench[benchIndex];
  const previousActive = state.active;

  state.bench.splice(benchIndex, 1);
  if (previousActive) {
    state.bench.push(previousActive);
  }
  state.active = nextActive;
}

export function queueMoveAction(battleId: string, player: PlayerKey, moveId: string): QueueResult {
  const runtime = ensureRuntime(battleId);
  const moves = listLegalMoves(battleId, player);
  const match = moves.find((move) => move.id === moveId);
  if (!match) {
    throw new Error(`Invalid move selection for ${player}`);
  }

  const action: BattleQueuedAction = { type: "move", moveId: match.id, requestId: randomUUID() };
  runtime.pending[player] = action;

  if (runtime.pending.p1 && runtime.pending.p2) {
    const resolved = finalizeTurn(runtime);
    return { status: "ready", turn: resolved.turn, action, resolved } satisfies QueueResult;
  }

  return { status: "queued", turn: runtime.turn, action } satisfies QueueResult;
}

export function queueSwitchAction(battleId: string, player: PlayerKey, targetId: string): QueueResult {
  const runtime = ensureRuntime(battleId);
  const options = listSwitchOptions(battleId, player);
  const match = options.find((option) => option.id === targetId);
  if (!match) {
    throw new Error(`Invalid switch target for ${player}`);
  }

  const action: BattleQueuedAction = { type: "switch", targetId: match.id, requestId: randomUUID() };
  runtime.pending[player] = action;

  if (runtime.pending.p1 && runtime.pending.p2) {
    const resolved = finalizeTurn(runtime);
    return { status: "ready", turn: resolved.turn, action, resolved } satisfies QueueResult;
  }

  return { status: "queued", turn: runtime.turn, action } satisfies QueueResult;
}
