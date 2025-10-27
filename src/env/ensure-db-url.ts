const fallbackOrder = [
  "DATABASE_URL",
  "DATABASE_INTERNAL_URL",
  "DATABASE_URL_INTERNAL",
] as const;

type FallbackKey = (typeof fallbackOrder)[number];

function nowIso(): string {
  return new Date().toISOString();
}

function structuredLog(level: "info" | "error", message: string, meta: Record<string, unknown>) {
  const payload = { t: nowIso(), level, msg: message, ...meta };
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

function redact(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return value.replace(/:.*/, ":<redacted>");
}

let resolvedSource: FallbackKey | undefined;

for (const key of fallbackOrder) {
  const candidate = process.env[key];
  if (candidate && candidate.trim().length > 0) {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = candidate;
    }
    resolvedSource = key;
    structuredLog("info", "DATABASE_URL resolved", {
      "db.url.source": key,
      "db.url.preview": redact(candidate),
    });
    break;
  }
}

if (!resolvedSource) {
  structuredLog("error", "DATABASE_URL missing", {
    guidance:
      "Expected Render envVars to map DATABASE_URL from the managed Postgres connectionString before Prisma loads.",
  });
}

export const databaseUrlSource: FallbackKey | undefined = resolvedSource;
