import { MemoryAuditTrail, type AuditTrail, type AuditEvent } from "../audit.js";
import { createSeededRng, type Rng, type RngState } from "../rng.js";
import type { ProvenanceRecord } from "../data/provenance.js";

export type BattleParticipant = {
  id: string;
  name?: string;
  hp: number;
  speed: number;
  side?: string;
  tags?: readonly string[];
};

export type BattleAction = {
  actorId: string;
  targetId?: string;
  moveId?: string;
  power?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
};

export type BattleEngineConfig = {
  seed: number | string;
  participants: readonly BattleParticipant[];
  auditTrail?: AuditTrail;
  provenance?: ProvenanceRecord;
};

export type BattleSnapshot = {
  turn: number;
  participants: readonly BattleParticipant[];
  rngState: RngState;
  audit: readonly AuditEvent[];
};

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  return {
    ...participant,
    tags: participant.tags ? [...participant.tags] : undefined,
  };
}

export class BattleEngine {
  private readonly participants: Map<string, BattleParticipant>;
  private readonly rng: Rng;
  private readonly audit: AuditTrail;
  private turnCounter = 0;

  constructor(private readonly config: BattleEngineConfig) {
    if (!config.participants || config.participants.length < 2) {
      throw new Error("BattleEngine requires at least two participants");
    }
    this.participants = new Map(config.participants.map((p) => [p.id, cloneParticipant(p)]));
    this.rng = createSeededRng(config.seed);
    this.audit = config.auditTrail ?? new MemoryAuditTrail(config.provenance);
    this.audit.record({ phase: "PREPARE", action: "battle:initialized", context: { seed: this.rng.seed } });
  }

  runTurn(actions: readonly BattleAction[]): BattleSnapshot {
    this.turnCounter += 1;
    this.audit.record({ phase: "TURN_START", action: "turn:start", context: { turn: this.turnCounter } });

    const orderedActions = [...actions].sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      if (priorityA !== priorityB) return priorityB - priorityA;

      const speedA = this.participants.get(a.actorId)?.speed ?? 0;
      const speedB = this.participants.get(b.actorId)?.speed ?? 0;
      if (speedA !== speedB) return speedB - speedA;

      return this.rng.nextFloat() - 0.5;
    });

    for (const action of orderedActions) {
      this.resolveAction(action);
    }

    this.audit.record({
      phase: "TURN_END",
      action: "turn:complete",
      context: { turn: this.turnCounter, rngCounter: this.rng.counter },
    });

    return this.snapshot();
  }

  private resolveAction(action: BattleAction): void {
    const actor = this.participants.get(action.actorId);
    if (!actor) {
      this.audit.record({ phase: "RESOLVE_ACTIONS", action: "action:skipped", context: { reason: "actor_missing", action } });
      return;
    }
    if (actor.hp <= 0) {
      this.audit.record({ phase: "RESOLVE_ACTIONS", action: "action:skipped", context: { reason: "actor_fainted", actorId: actor.id } });
      return;
    }

    const target = this.pickTarget(actor, action.targetId);
    if (!target) {
      this.audit.record({ phase: "RESOLVE_ACTIONS", action: "action:skipped", context: { reason: "no_target", actorId: actor.id } });
      return;
    }

    const power = Math.max(1, Math.floor(action.power ?? 10));
    const damage = Math.min(power, target.hp);
    target.hp -= damage;

    this.audit.record({
      phase: "RESOLVE_ACTIONS",
      action: "action:resolved",
      context: {
        actorId: actor.id,
        targetId: target.id,
        moveId: action.moveId ?? "BASIC",
        damage,
        remainingHp: target.hp,
      },
    });

    if (target.hp <= 0) {
      this.audit.record({
        phase: "RESOLVE_ACTIONS",
        action: "target:fainted",
        context: { targetId: target.id, turn: this.turnCounter },
      });
    }
  }

  private pickTarget(actor: BattleParticipant, targetId?: string): BattleParticipant | undefined {
    const candidateIds = Array.from(this.participants.values())
      .filter((participant) => participant.id !== actor.id && participant.hp > 0)
      .map((participant) => participant.id);

    if (candidateIds.length === 0) {
      return undefined;
    }

    if (targetId) {
      const explicit = this.participants.get(targetId);
      if (explicit && explicit.hp > 0 && explicit.id !== actor.id) {
        return explicit;
      }
    }

    const randomId = this.rng.pick(candidateIds);
    return this.participants.get(randomId);
  }

  snapshot(): BattleSnapshot {
    return {
      turn: this.turnCounter,
      participants: Array.from(this.participants.values()).map(cloneParticipant),
      rngState: this.rng.snapshot(),
      audit: this.audit.flush(),
    };
  }
}
