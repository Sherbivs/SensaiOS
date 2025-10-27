import { createSeededRng, type RngState } from "../rng.js";
import type { ProvenanceRecord } from "../data/provenance.js";

export type EncounterCandidate = {
  speciesId: string;
  weight: number;
  minLevel: number;
  maxLevel: number;
};

export type EncounterConfig = {
  seed: number | string;
  candidates: readonly EncounterCandidate[];
  shinyOdds?: number;
  provenance?: ProvenanceRecord;
};

export type EncounterRoll = {
  speciesId: string;
  level: number;
  shiny: boolean;
  weight: number;
};

export type EncounterResult = {
  roll: EncounterRoll;
  rngState: RngState;
  provenance?: ProvenanceRecord;
};

const DEFAULT_SHINY_ODDS = 4096;

function validateCandidates(candidates: readonly EncounterCandidate[]): void {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Encounter candidates cannot be empty");
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.speciesId !== "string") {
      throw new Error("Encounter candidate missing speciesId");
    }
    if (!Number.isFinite(candidate.weight) || candidate.weight <= 0) {
      throw new Error(`Encounter candidate ${candidate.speciesId} has invalid weight`);
    }
    if (!Number.isFinite(candidate.minLevel) || !Number.isFinite(candidate.maxLevel)) {
      throw new Error(`Encounter candidate ${candidate.speciesId} has invalid level range`);
    }
  }
}

function pickCandidate(totalWeight: number, roll: number, candidates: readonly EncounterCandidate[]): EncounterCandidate {
  let cursor = 0;
  for (const candidate of candidates) {
    cursor += candidate.weight;
    if (roll < cursor) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

function rollLevel(rngValue: number, candidate: EncounterCandidate): number {
  const minLevel = Math.max(1, Math.floor(candidate.minLevel));
  const maxLevel = Math.max(minLevel, Math.floor(candidate.maxLevel));
  if (minLevel === maxLevel) {
    return minLevel;
  }
  const span = maxLevel - minLevel + 1;
  return minLevel + Math.floor(rngValue * span);
}

export function generateEncounter(config: EncounterConfig): EncounterResult {
  validateCandidates(config.candidates);
  const shinyOdds = Math.max(1, Math.floor(config.shinyOdds ?? DEFAULT_SHINY_ODDS));
  const rng = createSeededRng(config.seed);

  const totalWeight = config.candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const weightedRoll = rng.nextFloat() * totalWeight;
  const selected = pickCandidate(totalWeight, weightedRoll, config.candidates);
  const levelRoll = rng.nextFloat();
  const shinyRoll = rng.nextFloat();

  const level = rollLevel(levelRoll, selected);
  const shiny = shinyRoll < 1 / shinyOdds;

  return {
    roll: {
      speciesId: selected.speciesId,
      level,
      shiny,
      weight: selected.weight,
    },
    rngState: rng.snapshot(),
    provenance: config.provenance,
  };
}
