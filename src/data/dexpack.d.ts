export interface LearnsetLevelEntry {
  move: string;
  level: number | null;
}

export interface SpeciesDoc {
  id: number;
  slug: string;
  name: string;
  typing: string[];
  abilities: Array<{ name: string; hidden: boolean; slot: number }>;
  baseStats: { hp: number; atk: number; def: number; spAtk: number; spDef: number; spe: number };
  height: number | null;
  weight: number | null;
  learnsets: {
    level: LearnsetLevelEntry[];
    machine: string[];
    tutor: string[];
    egg: string[];
  };
  matchups: Record<string, number>;
  aliases: string[];
}

export interface MoveDoc {
  id: number;
  name: string;
  slug: string;
  type: string | null;
  category: string | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  target: string | null;
  effect: string | null;
  meta: Record<string, unknown> | null;
}

export interface DexPack {
  meta: {
    schema: string;
    generatedAt: string;
    source: {
      versionGroup: string | null;
      versionGroupId: number | null;
      builtAt: string | null;
      cacheChecksum: string | null;
      cacheCount: number | null;
      cacheUpdatedAt: string | null;
    };
    counts: {
      species: number;
      moves: number;
    };
  };
  byId: Record<string, SpeciesDoc>;
  byName: Record<string, number>;
  byAlias: Record<string, number>;
  moves: Record<string, MoveDoc>;
  types: {
    order: string[];
    chart: Record<string, Record<string, number>>;
  };
}

export interface DexpackHashTable {
  size: number;
  ids: Int32Array;
  keys: string[];
}

export interface FastDexpack {
  statIndex: Int32Array;
  baseStats: Uint16Array;
  matchupIndex: Int32Array;
  matchups: Float32Array;
  typeOrder: string[];
  nameTable: DexpackHashTable | null;
  aliasTable: DexpackHashTable | null;
}

export declare function loadDexpack(customPath?: string): DexPack;
export declare function getDexpack(): DexPack;
export declare function getLoadedPath(): string | null;
export declare function getSpecies(query: string | number): SpeciesDoc | null;
export declare function getSpeciesBaseStats(id: string | number): SpeciesDoc["baseStats"] | null;
export declare function getSpeciesMatchups(id: string | number): Record<string, number>;
export declare function getMove(name: string): MoveDoc | null;
export declare function getTypeChart(): DexPack["types"];
export declare function listSpecies(): SpeciesDoc[];
export declare function suggestSpecies(prefix: string, limit?: number): string[];
export declare function resetDexpack(): void;

export declare const dexpackState: Readonly<{ pack: DexPack | null; loadedFrom: string | null; fast: FastDexpack | null; runtime: string | null }>;

declare const _default: {
  loadDexpack: typeof loadDexpack;
  getDexpack: typeof getDexpack;
  getLoadedPath: typeof getLoadedPath;
  getSpecies: typeof getSpecies;
  getSpeciesBaseStats: typeof getSpeciesBaseStats;
  getSpeciesMatchups: typeof getSpeciesMatchups;
  getMove: typeof getMove;
  getTypeChart: typeof getTypeChart;
  listSpecies: typeof listSpecies;
  suggestSpecies: typeof suggestSpecies;
  resetDexpack: typeof resetDexpack;
  dexpackState: typeof dexpackState;
};
