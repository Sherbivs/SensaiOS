// Battle core v1: thin TypeScript wrappers around the JS engine in src/engine/*
// Provides deterministic RNG, simple helpers to build runtimes from dex, and resolve a turn.
// Import CommonJS modules from our JS engine using esModuleInterop
// Legacy CommonJS modules without TypeScript definitions
import engine from "../../engine/index.js";
const engineModule = engine;
// Simple, deterministic LCG RNG with 32-bit state
export class SeededRNG {
    state;
    constructor(seed) {
        // Hash string seeds lightly; keep non-negative 32-bit
        let s = 0;
        if (typeof seed === 'string') {
            for (let i = 0; i < seed.length; i++)
                s = (s * 31 + seed.charCodeAt(i)) | 0;
            seed = s;
        }
        this.state = (Number(seed) >>> 0) || 1;
    }
    next() {
        // LCG constants from Numerical Recipes
        this.state = (1664525 * this.state + 1013904223) >>> 0;
        // Map to [0,1)
        return (this.state >>> 0) / 0x1_0000_0000; // 2^32
    }
}
export function loadIndexes() {
    // engine.loadIndexes returns { dexLookup, movesIndex }
    return engineModule.loadIndexes();
}
export function buildRuntimeFromDex(name, level = 50, moves = [], opts = {}) {
    const { dexLookup } = loadIndexes();
    const dexMon = dexLookup(name);
    if (!dexMon)
        throw new Error(`Unknown species: ${name}`);
    const p = engineModule.makeRuntimeFromDexEntry(dexMon, level, moves, opts);
    return p;
}
export function newBattle(init) {
    const { a, b } = init;
    const pa = buildRuntimeFromDex(a.name, a.level ?? 50, a.moves ?? [], a.opts ?? {});
    const pb = buildRuntimeFromDex(b.name, b.level ?? 50, b.moves ?? [], b.opts ?? {});
    const state = engineModule.newBattleState(pa, pb);
    // Build a ctx compatible with engine
    const indexes = loadIndexes();
    const rng = init.seed != null ? new SeededRNG(init.seed) : undefined;
    const ctx = {
        rng,
        weather: init.weather ?? null,
    };
    if (typeof init.critChance === "number")
        ctx.critChance = init.critChance;
    return { state, ctx, indexes };
}
export function resolveTurn(battle, moveA, moveB) {
    const { state, ctx, indexes } = battle;
    const actionA = engineModule.newAction("a", moveA);
    const actionB = engineModule.newAction("b", moveB);
    const result = engineModule.resolveTurn(state, actionA, actionB, { ...ctx, ...indexes, publicLog: [] });
    return result;
}
