import { randomUUID } from "node:crypto";
const runtimes = new Map();
function ensureRuntime(battleId) {
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
        };
        runtimes.set(battleId, runtime);
    }
    return runtime;
}
export function setPlayerState(battleId, player, state) {
    const runtime = ensureRuntime(battleId);
    runtime.players[player] = {
        active: state.active,
        bench: [...state.bench],
    };
    // Reset pending action when party context changes
    if (runtime.pending[player]) {
        delete runtime.pending[player];
    }
    return runtime.players[player];
}
export function listLegalMoves(battleId, player) {
    const runtime = ensureRuntime(battleId);
    const active = runtime.players[player]?.active;
    return active ? [...active.moves] : [];
}
export function listSwitchOptions(battleId, player) {
    const runtime = ensureRuntime(battleId);
    const state = runtime.players[player];
    if (!state)
        return [];
    return state.bench.filter((member) => !member.fainted && member.hp > 0);
}
function finalizeTurn(runtime) {
    const pending = runtime.pending;
    const resolved = {
        turn: runtime.turn + 1,
        actions: {
            p1: pending.p1,
            p2: pending.p2,
        },
    };
    runtime.turn = resolved.turn;
    runtime.history.push(resolved);
    runtime.pending = {};
    for (const key of ["p1", "p2"]) {
        const action = resolved.actions[key];
        if (action.type === "switch") {
            applySwitch(runtime, key, action.targetId);
        }
    }
    return resolved;
}
function applySwitch(runtime, player, targetId) {
    const state = runtime.players[player];
    if (!state)
        return;
    const benchIndex = state.bench.findIndex((member) => member.id === targetId);
    if (benchIndex === -1)
        return;
    const nextActive = state.bench[benchIndex];
    const previousActive = state.active;
    state.bench.splice(benchIndex, 1);
    if (previousActive) {
        state.bench.push(previousActive);
    }
    state.active = nextActive;
}
export function queueMoveAction(battleId, player, moveId) {
    const runtime = ensureRuntime(battleId);
    const moves = listLegalMoves(battleId, player);
    const match = moves.find((move) => move.id === moveId);
    if (!match) {
        throw new Error(`Invalid move selection for ${player}`);
    }
    const action = { type: "move", moveId: match.id, requestId: randomUUID() };
    runtime.pending[player] = action;
    if (runtime.pending.p1 && runtime.pending.p2) {
        const resolved = finalizeTurn(runtime);
        return { status: "ready", turn: resolved.turn, action, resolved };
    }
    return { status: "queued", turn: runtime.turn, action };
}
export function queueSwitchAction(battleId, player, targetId) {
    const runtime = ensureRuntime(battleId);
    const options = listSwitchOptions(battleId, player);
    const match = options.find((option) => option.id === targetId);
    if (!match) {
        throw new Error(`Invalid switch target for ${player}`);
    }
    const action = { type: "switch", targetId: match.id, requestId: randomUUID() };
    runtime.pending[player] = action;
    if (runtime.pending.p1 && runtime.pending.p2) {
        const resolved = finalizeTurn(runtime);
        return { status: "ready", turn: resolved.turn, action, resolved };
    }
    return { status: "queued", turn: runtime.turn, action };
}
// Testing utilities - clears all battle runtimes between tests
export const __testing = {
    clear: () => {
        runtimes.clear();
    },
    getRuntimeCount: () => runtimes.size,
};
