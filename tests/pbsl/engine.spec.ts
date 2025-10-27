import { describe, expect, it } from "vitest";
import { BattleEngine } from "../../src/core/pbsl/battle/engine.js";

const baseParticipants = [
  { id: "trainer-1", name: "Bulby", hp: 100, speed: 50 },
  { id: "trainer-2", name: "Charm", hp: 100, speed: 40 },
];

const actions = [
  { actorId: "trainer-1", moveId: "TACKLE", power: 18 },
  { actorId: "trainer-2", moveId: "EMBER", power: 22 },
];

describe("PBSL BattleEngine", () => {
  it("produces identical snapshots for identical seeds", () => {
    const engineA = new BattleEngine({ seed: "seed-1", participants: baseParticipants });
    const engineB = new BattleEngine({ seed: "seed-1", participants: baseParticipants });

    const snapshotA = engineA.runTurn(actions);
    const snapshotB = engineB.runTurn(actions);

    expect(snapshotA.turn).toBe(snapshotB.turn);
    expect(snapshotA.participants).toStrictEqual(snapshotB.participants);
    expect(snapshotA.rngState).toStrictEqual(snapshotB.rngState);
    expect(snapshotA.audit).toStrictEqual(snapshotB.audit);
  });

  it("records battle events in audit trail", () => {
    const engine = new BattleEngine({ seed: 42, participants: baseParticipants });
    const snapshot = engine.runTurn(actions);

    const eventPhases = snapshot.audit.map((entry) => entry.phase);
    expect(eventPhases).toContain("PREPARE");
    expect(eventPhases).toContain("TURN_START");
    expect(eventPhases).toContain("TURN_END");

    const resolved = snapshot.audit.filter((entry) => entry.action === "action:resolved");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.context?.damage).toBeGreaterThan(0);
  });
});
