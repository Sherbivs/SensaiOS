// Arena summary helpers for compact public messages and detailed DM logs

export function buildArenaTurnSummary(log: string[]): string {
  // Keep high-signal lines, trim numbers to keep it compact
  const key = log
    .filter(Boolean)
    .map((l) => String(l))
    .filter((l) => /uses|missed|flinched|fainted|restored|hurt by recoil/i.test(l))
    .map((l) => l.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim());
  const uniq: string[] = [];
  for (const s of key) if (!uniq.includes(s)) uniq.push(s);
  return uniq.join(" · ");
}

export function buildDMDetailedLog(log: string[]): string {
  return log.filter(Boolean).map((l) => String(l)).join("\n");
}
