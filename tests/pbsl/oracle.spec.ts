import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BattleEngine,
  type BattleAction,
  type BattleParticipant,
  type BattleSnapshot,
} from "../../src/core/pbsl/battle/engine.js";
import type { RngState } from "../../src/core/pbsl/rng.js";
import type { AuditEvent } from "../../src/core/pbsl/audit.js";
import type { ProvenanceRecord } from "../../src/core/pbsl/data/provenance.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "fixtures");
const REPORT_PATH = resolve(process.cwd(), "pbsl-oracle-report.json");

export type OracleFixture = {
  id: string;
  description?: string;
  seed: number | string;
  participants: BattleParticipant[];
  actions: BattleAction[];
  provenance?: ProvenanceRecord;
  expected: {
    turn: number;
    rngState: RngState;
    participants: Array<Record<string, unknown>>;
    audit: Array<{
      phase: string;
      action: string;
      context?: Record<string, unknown>;
    }>;
  };
};

type OracleResult = {
  fixtureId: string;
  file: string;
  status: "passed" | "failed";
  actual: OracleFixture["expected"];
  expected: OracleFixture["expected"];
  message?: string;
};

const oracleResults: OracleResult[] = [];

type LoadedFixture = OracleFixture & { fileName: string };

function readFixtures(): LoadedFixture[] {
  const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));
  return files.map((file) => {
    const raw = readFileSync(resolve(FIXTURE_DIR, file), "utf8");
    const data = JSON.parse(raw) as OracleFixture;
    if (!data.id) {
      throw new Error(`Fixture ${file} is missing an id`);
    }
    return { ...data, fileName: file };
  });
}

function sanitizeParticipant(participant: BattleParticipant): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    id: participant.id,
    hp: participant.hp,
    speed: participant.speed,
  };
  if (participant.name) sanitized.name = participant.name;
  if (participant.side) sanitized.side = participant.side;
  if (participant.tags && participant.tags.length > 0) sanitized.tags = [...participant.tags];
  return sanitized;
}

function sanitizeContext(context: AuditEvent["context"]): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    sanitized[key] = value;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeAuditEvent(event: AuditEvent): { phase: string; action: string; context?: Record<string, unknown> } {
  return {
    phase: event.phase,
    action: event.action,
    context: sanitizeContext(event.context),
  };
}

function sanitizeSnapshot(snapshot: BattleSnapshot, expectedOrder: string[]): OracleFixture["expected"] {
  const orderedParticipants = [...snapshot.participants]
    .map(sanitizeParticipant)
    .sort((a, b) => {
      const indexA = expectedOrder.indexOf(String(a.id));
      const indexB = expectedOrder.indexOf(String(b.id));
      const safeA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
      const safeB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
      if (safeA === safeB) {
        return String(a.id).localeCompare(String(b.id));
      }
      return safeA - safeB;
    });

  return {
    turn: snapshot.turn,
    rngState: snapshot.rngState,
    participants: orderedParticipants,
    audit: snapshot.audit.map(sanitizeAuditEvent),
  };
}

const fixtures = readFixtures();

describe("PBSL oracle comparison", () => {
  for (const fixture of fixtures) {
    it(`matches oracle fixture ${fixture.id}`, () => {
      const engine = new BattleEngine({
        seed: fixture.seed,
        participants: fixture.participants,
        provenance: fixture.provenance,
      });

      const snapshot = engine.runTurn(fixture.actions);
      const expectedOrder = fixture.expected.participants.map((participant) => String(participant.id));
      const sanitized = sanitizeSnapshot(snapshot, expectedOrder);

      let message: string | undefined;
      try {
        expect(sanitized).toStrictEqual(fixture.expected);
        oracleResults.push({
          fixtureId: fixture.id,
          file: fixture.fileName,
          status: "passed",
          actual: sanitized,
          expected: fixture.expected,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        oracleResults.push({
          fixtureId: fixture.id,
          file: fixture.fileName,
          status: "failed",
          actual: sanitized,
          expected: fixture.expected,
          message,
        });
        throw error;
      }
    });
  }
});

afterAll(() => {
  const payload = {
    generatedAt: new Date().toISOString(),
    fixtures: oracleResults,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
});
