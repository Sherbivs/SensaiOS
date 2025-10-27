import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

type OutputFile = { path: string; content: string; hash: string };

type BuildOptions = {
  dryRun?: boolean;
  rootDir?: string; // override CWD for tests
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function toStable(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(toStable);
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = toStable(obj[key]);
  }
  return out;
}

function stableStringify(obj: any): string {
  return JSON.stringify(toStable(obj));
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function buildData(opts: BuildOptions = {}): Promise<{
  outputs: OutputFile[];
  counts: { species: number; moves: number; abilities: number };
  manifest: { version: string; updatedAt: string };
}> {
  const root = opts.rootDir ?? process.cwd();
  const bootstrapDir = join(root, "data", "bootstrap");
  const outDir = join(root, "data");

  type DexEntry = {
    num?: number;
    id?: string;
    name?: string;
    types?: string[];
    baseStats?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    abilities?: Record<string, string> | string[];
  };
  type DexFile = Record<string, DexEntry> | DexEntry[];
  type MoveEntry = {
    num?: number;
    id?: string;
    name?: string;
    type?: string;
    category?: string;
    basePower?: number | null;
    accuracy?: number | true | null;
    pp?: number;
  };
  type MovesFile = Record<string, MoveEntry> | MoveEntry[];

  // Input sources
  const dexPath = join(bootstrapDir, "dex.min.json");
  const movesPath = join(bootstrapDir, "moves.min.json");
  const versionPath = join(bootstrapDir, "version.json");

  const dex = await readJson<DexFile>(dexPath);
  const moves = await readJson<MovesFile>(movesPath);
  let version = "0.0.0";
  try {
    const v = await readJson<Record<string, any>>(versionPath);
    version = String(v.version ?? v.tag ?? v.commit ?? "0.0.0");
  } catch {
    // ignore
  }

  const speciesArr: Array<{ id: number; name: string; types: string[]; baseStats: any; abilities: string[] }> = [];
  const abilitiesSet = new Set<string>();

  const dexEntries: DexEntry[] = Array.isArray(dex) ? dex : Object.values(dex);
  for (const d of dexEntries) {
    const idRaw = d.num ?? (typeof d.id === "string" ? Number.parseInt(d.id, 10) : d.id);
    const id = Number.isFinite(Number(idRaw)) ? Number(idRaw) : Number.NaN;
    const name = d.name ?? d.id ?? String(d.num ?? "");
    const types = (d.types ?? []).slice(0, 2);
    const statsSource: any = d.baseStats ?? d.stats ?? null;
    const baseStats = statsSource
      ? {
          hp: Number(statsSource.hp ?? statsSource.HP ?? 1),
          atk: Number(statsSource.atk ?? statsSource.attack ?? 1),
          def: Number(statsSource.def ?? statsSource.defense ?? 1),
          spa: Number(statsSource.spa ?? statsSource['special-attack'] ?? 1),
          spd: Number(statsSource.spd ?? statsSource['special-defense'] ?? 1),
          spe: Number(statsSource.spe ?? statsSource.speed ?? 1),
        }
      : { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    const abilList = Array.isArray(d.abilities)
      ? (d.abilities as string[])
      : Object.values(d.abilities ?? {});
    for (const a of abilList) abilitiesSet.add(a);
    if (!Number.isFinite(id) || !name || types.length === 0) continue;
    speciesArr.push({ id, name, types, baseStats, abilities: abilList.filter(Boolean) });
  }
  speciesArr.sort((a, b) => a.id - b.id);

  const movesArrRaw: MoveEntry[] = Array.isArray(moves) ? moves : Object.values(moves);
  const movesArr: Array<{ id: number; name: string; type: string; category: string; power: number | null; accuracy: number | null; pp: number }>
    = [];
  for (const m of movesArrRaw) {
    const idRaw = m.num ?? (typeof m.id === "string" ? Number.parseInt(m.id, 10) : m.id);
    const id = Number.isFinite(Number(idRaw)) ? Number(idRaw) : Number.NaN;
    const name = m.name ?? m.id ?? String(m.num ?? "");
    const type = m.type ?? "Normal";
    const category = m.category ?? (m as any).class ?? "Status";
    const power = m.basePower ?? (m as any).power ?? null;
    let acc: number | null = null;
    if (typeof m.accuracy === "number") acc = m.accuracy;
    else if (m.accuracy === true) acc = 100;
    const pp = m.pp ?? 10;
    if (!Number.isFinite(id) || !name) continue;
    movesArr.push({ id, name, type, category, power, accuracy: acc, pp });
  }
  movesArr.sort((a, b) => a.id - b.id);

  const abilityNames = Array.from(abilitiesSet)
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (value && typeof value === "object" && "name" in value) {
        const maybe = (value as { name?: unknown }).name;
        return typeof maybe === "string" ? maybe.trim() : "";
      }
      return "";
    })
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  abilityNames.sort((a, b) => a.localeCompare(b));

  const abilitiesArr = abilityNames.map((name, idx) => ({ id: idx + 1, name }));

  // Build outputs (deterministic)
  const outputs: OutputFile[] = [];

  for (const s of speciesArr) {
    const rel = join("data", "pokemon", `${s.id}.json`);
    const content = stableStringify(s);
    outputs.push({ path: rel, content, hash: sha256(content) });
  }
  for (const m of movesArr) {
    const rel = join("data", "moves", `${m.id}.json`);
    const content = stableStringify(m);
    outputs.push({ path: rel, content, hash: sha256(content) });
  }
  for (const a of abilitiesArr) {
    const rel = join("data", "abilities", `${a.id}.json`);
    const content = stableStringify({ ...a, description: "" });
    outputs.push({ path: rel, content, hash: sha256(content) });
  }

  const timestamp = opts.dryRun ? new Date(0).toISOString() : new Date().toISOString();

  const manifest = {
    version,
    updatedAt: timestamp,
    counts: { species: speciesArr.length, moves: movesArr.length, abilities: abilitiesArr.length },
    files: outputs.map((o) => ({ path: o.path, hash: o.hash })),
  };
  const manifestRel = join("data", "manifest.json");
  const manifestContent = stableStringify(manifest);
  outputs.push({ path: manifestRel, content: manifestContent, hash: sha256(manifestContent) });

  if (!opts.dryRun) {
    // Write to disk
    const dirs = ["pokemon", "moves", "abilities"]; 
    for (const d of dirs) {
      await mkdir(join(outDir, d), { recursive: true });
    }
    for (const o of outputs) {
      const abs = join(root, o.path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, o.content + "\n", "utf8");
    }
  }

  return { outputs, counts: manifest.counts, manifest: { version: manifest.version, updatedAt: manifest.updatedAt } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  buildData({ dryRun }).then((res) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, counts: res.counts }, null, 2));
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Pipeline failed:", err);
    process.exit(1);
  });
}
// Data pipeline entry point (stub)
// TODO: implement fetch/normalize/shard and manifest generation
export const dataPipeline = {
  dryRun: true,
};
