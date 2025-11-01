const fallbackOrder = [
  "DATABASE_POOL_URL",
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

type Candidate = {
  key: FallbackKey;
  value: string;
  isLocal: boolean;
};

const isTestEnv = process.env.NODE_ENV === "test";

if (!process.env.DATABASE_URL && isTestEnv) {
  process.env.DATABASE_URL = "postgres://placeholder.invalid/test-db";
}

const candidates: Candidate[] = fallbackOrder
  .map((key) => {
    const raw = process.env[key];
    if (!raw) return undefined;
    const value = raw.trim();
    if (!value) return undefined;
    return { key, value, isLocal: isLikelyLocal(value) } as Candidate;
  })
  .filter((entry): entry is Candidate => entry !== undefined);

const preferred = candidates.find((entry) => !entry.isLocal) ?? candidates[0];

let resolvedSource: FallbackKey | undefined;

if (preferred) {
  const previousValue = process.env.DATABASE_URL;
  process.env.DATABASE_URL = preferred.value;
  resolvedSource = preferred.key;
  structuredLog("info", "DATABASE_URL resolved", {
    "db.url.source": preferred.key,
    "db.url.preview": redact(preferred.value),
  });

  if (previousValue && previousValue !== preferred.value) {
    structuredLog("info", "DATABASE_URL override applied", {
      "db.url.previous_preview": redact(previousValue),
      "db.url.source": preferred.key,
    });
  }

  if (preferred.isLocal) {
    const meta = {
      "db.url.source": preferred.key,
      "db.url.preview": redact(preferred.value),
      guidance:
        "Render production services must map DATABASE_URL to the managed Postgres connectionString/internalConnectionString.",
    } as const;
    if (isProductionLike()) {
      structuredLog("error", "DATABASE_URL is pointing at localhost", meta);
    } else {
      structuredLog("info", "DATABASE_URL using localhost fallback", meta);
    }
  }
} else {
  structuredLog("error", "DATABASE_URL missing", {
    guidance:
      "Expected Render envVars to map DATABASE_URL from the managed Postgres connectionString before Prisma loads.",
  });
}

const hasDirectUrl = typeof process.env.DATABASE_DIRECT_URL === "string" && process.env.DATABASE_DIRECT_URL.trim().length > 0;

if (hasDirectUrl) {
  structuredLog("info", "DATABASE_DIRECT_URL provided", {
    "db.direct.preview": redact(process.env.DATABASE_DIRECT_URL?.trim()),
  });
} else {
  const directFallback = candidates.find((entry) => entry.key === "DATABASE_INTERNAL_URL" || entry.key === "DATABASE_URL_INTERNAL");
  const safeDirect =
    directFallback?.value ??
    (preferred && preferred.key !== "DATABASE_POOL_URL" ? preferred.value : undefined);

  if (safeDirect) {
    process.env.DATABASE_DIRECT_URL = safeDirect;
    structuredLog("info", "DATABASE_DIRECT_URL resolved", {
      "db.direct.source": directFallback?.key ?? preferred?.key ?? "unknown",
      "db.direct.preview": redact(safeDirect),
    });
  } else if (preferred?.key === "DATABASE_POOL_URL") {
    structuredLog("info", "DATABASE_DIRECT_URL missing", {
      guidance:
        "Set DATABASE_DIRECT_URL (Render direct connection string) so Prisma migrations bypass the pooler.",
    });
  }
}

export const databaseUrlSource: FallbackKey | undefined = resolvedSource;

function isLikelyLocal(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1|::1/.test(candidate);
  }
}

function isProductionLike(): boolean {
  if (typeof process.env.RENDER !== "undefined") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}
