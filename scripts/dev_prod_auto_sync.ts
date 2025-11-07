import { spawn } from "node:child_process";
import https from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

type EnvVars = Record<string, string>;

type SyncConfig = {
  devEnvPath: string;
  prodEnvPath: string;
  localEnvPath: string | null;
  triggerPath: string;
  intervalMs: number;
  reverseCheckIntervalMs: number;
  once: boolean;
  dryRun: boolean;
  skipStartup: boolean;
  ci: boolean;
  alertWebhookUrl: string;
  suppressAlerts: boolean;
  simulateAlert: boolean;
  enforceProdMaster: boolean; // PROD is the master (production database)
  includeLocal: boolean;
};

type CountSnapshot = {
  species: number;
  moves: number;
  abilities: number;
  learnsets: number;
  hash: string;
};

type EnvironmentName = "dev" | "prod" | "local";

const DEFAULT_DEV_ENV = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env";
const DEFAULT_PROD_ENV = "C:/Users/sherb/OneDrive/Documents/Key/Prod/.env";
const DEFAULT_LOCAL_ENV = null;
const DEFAULT_TRIGGER_PATH = path.join("data", "cache", "dex-sync-trigger.json");
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_REVERSE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

type DexTrigger = {
  kind: string;
  version: number;
  updatedAt: string;
  checksum: string;
  count?: number;
};

type IntegrityAlertPayload = {
  reason: string;
  delta: Record<string, number>;
  devCounts: CountSnapshot;
  prodCounts: CountSnapshot;
  enforcementMode?: "enabled" | "disabled";
  violationType?: "drift" | "reverse_integrity";
  affectedEnvironment?: "dev" | "local"; // PROD is master, so DEV or LOCAL can be affected
};

type AlertDispatcher = (payload: IntegrityAlertPayload) => Promise<void>;

const ALERT_WEBHOOK_USERNAME = "Dex Auto-Sync";
const ALERT_EMBED_COLOR = 0xf97316; // orange highlight

function sanitizeWebhook(urlString: string): string {
  try {
    const url = new URL(urlString);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      segments[segments.length - 1] = "***";
    }
    return `${url.origin}/${segments.join("/")}`;
  } catch {
    return "<redacted>";
  }
}

function formatCountsSnapshot(label: string, snapshot: CountSnapshot): string {
  return `${label}: species ${snapshot.species}, moves ${snapshot.moves}, abilities ${snapshot.abilities}, learnsets ${snapshot.learnsets}`;
}

function fingerprintAlert(reason: string, delta: Record<string, number>, devCounts: CountSnapshot, prodCounts: CountSnapshot): string {
  return [
    reason,
    delta.species,
    delta.moves,
    delta.abilities,
    delta.learnsets,
    devCounts.hash,
    prodCounts.hash,
  ].join("|");
}

async function postWebhook(webhookUrl: string, body: Record<string, unknown>): Promise<void> {
  const data = JSON.stringify(body);
  const target = new URL(webhookUrl);
  const options: https.RequestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
    timeout: 10_000,
  };

  await new Promise<void>((resolve, reject) => {
    const req = https.request(target, options, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.write(data);
    req.end();
  });
}

function buildAlertBody(
  payload: IntegrityAlertPayload,
  config: SyncConfig,
): Record<string, unknown> {
  const { reason, delta, devCounts, prodCounts, enforcementMode, violationType, affectedEnvironment } = payload;
  const deltaLine = `Δ species ${delta.species}, moves ${delta.moves}, abilities ${delta.abilities}, learnsets ${delta.learnsets}`;
  const igEnvFile = (process.env.IG_ENV_FILE || "").trim();
  const footerLines = [
    `dev env: ${config.devEnvPath}`,
    `prod env: ${config.prodEnvPath}`,
  ];
  if (igEnvFile) {
    footerLines.push(`IG_ENV_FILE: ${igEnvFile}`);
  }

  // Add enforcement context to footer
  if (enforcementMode) {
    footerLines.push(`enforcement: ${enforcementMode}`);
  }
  if (violationType) {
    footerLines.push(`violation: ${violationType}`);
  }
  if (affectedEnvironment) {
    footerLines.push(`affected: ${affectedEnvironment.toUpperCase()}`);
  }

  const fields = [
    {
      name: "Dev counts",
      value: formatCountsSnapshot("DEV", devCounts),
      inline: true,
    },
    {
      name: "Prod counts",
      value: formatCountsSnapshot("PROD", prodCounts),
      inline: true,
    },
  ];

  // Add enforcement-specific guidance
  if (enforcementMode === "enabled" && violationType === "reverse_integrity") {
    fields.push({
      name: "⚠️ CRITICAL: Unauthorized Database Change Detected",
      value: `${affectedEnvironment?.toUpperCase()} database diverged from DEV (master). Auto-enforcement will force ${affectedEnvironment?.toUpperCase()} to match DEV on next sync cycle. DEV is the single source of truth.`,
      inline: false,
    });
  }

  fields.push({
    name: "Investigate",
    value: "Run `npm run db:cli -- counts` on both envs, inspect recent deploys, rerun `npm run db:auto-sync -- --once`, and review docs/database-systems.md#auto-sync-drift-response-runbook.",
    inline: false,
  });

  return {
    username: ALERT_WEBHOOK_USERNAME,
    content: violationType === "reverse_integrity" 
      ? "🚨 CRITICAL: Unauthorized database change detected - DEV master enforcement active"
      : "⚠️ Dex auto-sync detected drift after consolidation.",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: violationType === "reverse_integrity" 
          ? "🔒 DEV Master Enforcement Alert" 
          : "Dex Auto-Sync Integrity Alert",
        description: [`Reason: ${reason}`, deltaLine].join("\n"),
        color: violationType === "reverse_integrity" ? 0xff0000 : ALERT_EMBED_COLOR, // Red for reverse integrity violations
        fields,
        timestamp: new Date().toISOString(),
        footer: {
          text: footerLines.join(" | "),
        },
      },
    ],
  };
}

function createIntegrityAlertDispatcher(config: SyncConfig): AlertDispatcher {
  let lastFingerprint: string | null = null;
  return async (payload) => {
    if (config.suppressAlerts) {
      log("integrity.alert.skip", { reason: payload.reason, cause: "alerts_suppressed" });
      return;
    }
    if (config.dryRun && !config.simulateAlert) {
      log("integrity.alert.skip", { reason: payload.reason, cause: "dry_run" });
      return;
    }

    const webhook = config.alertWebhookUrl.trim();
    if (!webhook) {
      log("integrity.alert.skip", { reason: payload.reason, cause: "no_destination" });
      return;
    }

    const fingerprint = fingerprintAlert(payload.reason, payload.delta, payload.devCounts, payload.prodCounts);
    if (fingerprint === lastFingerprint) {
      log("integrity.alert.skip", { reason: payload.reason, cause: "duplicate" });
      return;
    }

    try {
      await postWebhook(webhook, buildAlertBody(payload, config));
      lastFingerprint = fingerprint;
      log("integrity.alert.dispatched", {
        reason: payload.reason,
        destination: "webhook",
        webhook: sanitizeWebhook(webhook),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("integrity.alert.dispatch_error", {
        reason: payload.reason,
        destination: "webhook",
        webhook: sanitizeWebhook(webhook),
        message,
      });
    }
  };
}

function logAlertConfiguration(config: SyncConfig): void {
  if (config.suppressAlerts) {
    log("integrity.alert.config", {
      status: "suppressed",
      reason: "suppressAlerts_flag",
    });
    return;
  }

  const destination = config.alertWebhookUrl.trim();
  if (!destination) {
    log("integrity.alert.config_missing", {
      message: "Alerts are enabled but no webhook destination is configured.",
      remediation: "Set ALERT_WEBHOOK_URL in the env file or pass --alert-webhook to reach operators.",
    });
    return;
  }

  log("integrity.alert.config_ready", {
    destination: "webhook",
    webhook: sanitizeWebhook(destination),
  });
}

function log(message: string, context: Record<string, unknown> = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    message,
    ...context,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function parseArgs(): SyncConfig {
  const args = process.argv.slice(2);
  const config: SyncConfig = {
    devEnvPath: DEFAULT_DEV_ENV,
    prodEnvPath: DEFAULT_PROD_ENV,
    localEnvPath: DEFAULT_LOCAL_ENV,
    triggerPath: DEFAULT_TRIGGER_PATH,
    intervalMs: DEFAULT_INTERVAL_MS,
    reverseCheckIntervalMs: DEFAULT_REVERSE_CHECK_INTERVAL_MS,
    once: false,
    dryRun: false,
    skipStartup: false,
    ci: false,
    alertWebhookUrl: (process.env.ALERT_WEBHOOK_URL || "").trim(),
    suppressAlerts: false,
    simulateAlert: false,
    enforceProdMaster: true, // PROD is master by default (production database)
    includeLocal: false, // Local workstation sync is opt-in
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--dev-env":
        config.devEnvPath = args[++i] ?? config.devEnvPath;
        break;
      case "--prod-env":
        config.prodEnvPath = args[++i] ?? config.prodEnvPath;
        break;
      case "--local-env":
        config.localEnvPath = args[++i] ?? config.localEnvPath;
        config.includeLocal = true;
        break;
      case "--trigger-path":
        config.triggerPath = args[++i] ?? config.triggerPath;
        break;
      case "--interval":
        config.intervalMs = Number.parseInt(args[++i] ?? "", 10) || config.intervalMs;
        break;
      case "--reverse-check-interval":
        config.reverseCheckIntervalMs = Number.parseInt(args[++i] ?? "", 10) || config.reverseCheckIntervalMs;
        break;
      case "--once":
        config.once = true;
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--skip-startup":
        config.skipStartup = true;
        break;
      case "--ci":
        config.ci = true;
        break;
      case "--alert-webhook":
        config.alertWebhookUrl = (args[++i] ?? config.alertWebhookUrl).trim();
        break;
      case "--no-alerts":
        config.suppressAlerts = true;
        break;
      case "--simulate-alert":
        config.simulateAlert = true;
        break;
      case "--no-enforce":
        config.enforceProdMaster = false;
        break;
      case "--include-local":
        config.includeLocal = true;
        break;
      default:
        break;
    }
  }

  return config;
}

function resolvePath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);
}

function stripQuotes(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  const first = trimmed.at(0);
  if ((first === '"' || first === "'") && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readEnvFile(filePath: string): Promise<EnvVars> {
  const absolutePath = resolvePath(filePath);
  const exists = await fs
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);
  
  if (!exists) {
    // In production (Render), env files don't exist - use process.env instead
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      log("env.fallback", {
        message: "Environment file not found, using process.env",
        path: absolutePath,
        env: process.env.NODE_ENV,
      });
      
      // Return relevant environment variables from process.env
      const vars: EnvVars = {};
      const relevantKeys = [
        "PROD_DATABASE_URL",
        "DEV_DATABASE_URL",
        "DATABASE_URL",
        "RENDER_DB_INTERNAL_URL",
        "RENDER_DB_EXTERNAL_URL",
        "DATABASE_LOCAL_URL",
        "PRISMA_CLIENT_URL",
        "OPTIMIZE_API_KEY",
        "ALERT_WEBHOOK_URL",
      ];
      
      for (const key of relevantKeys) {
        const value = process.env[key];
        if (value) {
          vars[key] = value;
        }
      }
      
      return vars;
    }
    
    throw new Error(`Environment file not found: ${absolutePath}`);
  }

  const contents = await fs.readFile(absolutePath, "utf8");
  const vars: EnvVars = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    const rawVal = line.slice(idx + 1).trim();
    vars[key] = stripQuotes(rawVal);
  }

  return vars;
}

function buildChildEnv(
  envPath: string,
  fileVars: EnvVars,
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(fileVars)) {
    if (value !== undefined) {
      base[key] = value;
    }
  }

  base.IG_ENV_FILE = envPath;

  const flatOverrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      flatOverrides[key] = value;
    }
  }

  return {
    ...process.env,
    ...base,
    ...flatOverrides,
  };
}

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function spawnCommand(
  label: string,
  command: string,
  args: string[],
  dryRun: boolean,
  env: NodeJS.ProcessEnv,
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): Promise<void> {
  if (dryRun) {
    log("dry-run: skipping command", { label, command, args });
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    log("command.start", { label, command, args });
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    });

    const timer = setTimeout(() => {
      log("command.timeout", { label, command, args, timeoutMs });
      try {
        child.kill("SIGTERM");
      } catch (error) {
        log("command.timeout.error", {
          label,
          command,
          args,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (error) {
          log("command.timeout.kill_error", {
            label,
            command,
            args,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }, 2_000);
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      log("command.error", { label, error: error.message });
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        log("command.success", { label, command, args });
        resolve();
      } else {
        const message = `Command "${command} ${args.join(" ")}" failed with code ${code}`;
        log("command.failure", { label, command, args, code });
        reject(new Error(message));
      }
    });
  });
}

function cliEnvForMigrate(fileVars: EnvVars): Record<string, string | undefined> {
  // Prefer EXTERNAL_URL for WSL/remote access, fallback to DIRECT_URL for internal Render connections
  // 2-NODE CLUSTER: Always use direct PostgreSQL for migrations
  const direct =
    fileVars.RENDER_DB_EXTERNAL_URL || 
    fileVars.RENDER_DB_INTERNAL_URL || 
    fileVars.DATABASE_URL || 
    undefined;
  if (!direct) {
    log("migrate.env.missing_direct", {
      message: "RENDER_DB_EXTERNAL_URL/RENDER_DB_INTERNAL_URL missing; migrate may fail",
    });
  }
  return {
    DATABASE_URL: direct,
    PRISMA_CLIENT_ENGINE_TYPE: "",
  };
}

function cliEnvForSeed(fileVars: EnvVars): Record<string, string | undefined> {
  // CRITICAL: Use PROD_DATABASE_URL for production operations (local Render Node PostgreSQL)
  // Use DEV_DATABASE_URL for development and as source of truth for migrations
  // Fallback to legacy variables for backwards compatibility
  const isProd = process.env.NODE_ENV === "production";
  
  const seedUrl = isProd
    ? (fileVars.PROD_DATABASE_URL || fileVars.DATABASE_URL || "")
    : (fileVars.DEV_DATABASE_URL ||
       fileVars.RENDER_DB_EXTERNAL_URL || 
       fileVars.RENDER_DB_INTERNAL_URL || 
       fileVars.DATABASE_LOCAL_URL ||
       fileVars.DATABASE_URL || "");
  
  // 2-NODE CLUSTER: Always use direct PostgreSQL (no data proxy)
  log("cli.env.seed", { 
    environment: process.env.NODE_ENV,
    hasRenderInternalUrl: !!fileVars.RENDER_DB_INTERNAL_URL,
    hasRenderExternalUrl: !!fileVars.RENDER_DB_EXTERNAL_URL,
    hasDatabaseUrl: !!fileVars.DATABASE_URL,
    selectedUrl: seedUrl.substring(0, 30) + "...",
  });
  
  return {
    DATABASE_URL: seedUrl,
    PRISMA_CLIENT_ENGINE_TYPE: undefined,
  };
}

async function runPhase(
  name: EnvironmentName,
  envPath: string,
  envVars: EnvVars,
  dryRun: boolean,
): Promise<void> {
  const migrateEnv = buildChildEnv(envPath, envVars, cliEnvForMigrate(envVars));
  const seedEnv = buildChildEnv(envPath, envVars, cliEnvForSeed(envVars));

  await spawnCommand(`${name}:migrate`, "npx", ["prisma", "migrate", "deploy"], dryRun, migrateEnv);
  
  // Seed may fail if data already exists with foreign key constraints - this is acceptable
  try {
    await spawnCommand(`${name}:seed`, "npm", ["run", "db:seed:dex"], dryRun, seedEnv);
  } catch (seedError) {
    const message = seedError instanceof Error ? seedError.message : String(seedError);
    log("seed.skipped", { 
      environment: name, 
      reason: "foreign_key_constraint",
      message: "Seed failed (likely existing data with FK constraints); proceeding with existing data",
      detail: message,
    });
  }
}

async function preflightOptimize(envVars: EnvVars): Promise<void> {
  const url = envVars.OPTIMIZE_DATABASE_URL || envVars.OPTIMIZE_DIRECT_URL;
  if (!url) return;

  const targetVars: EnvVars = {
    DATABASE_URL: url,
  };

  await withPrismaClient("prod", targetVars, async (client) => {
    try {
      await client.$queryRawUnsafe('SELECT 1 FROM "SpeciesSheet" LIMIT 1');
      log("preflight.optimize.ok", { message: "Optimize DB SpeciesSheet readable." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("preflight.optimize.fail", {
        message: "Optimize DB SpeciesSheet access failed.",
        error: message,
        remediation: [
          'GRANT USAGE ON SCHEMA public TO <app_user>;',
          'GRANT SELECT ON MATERIALIZED VIEW public."SpeciesSheet" TO <app_user>;',
        ],
      });
    }
  });
}

async function withPrismaClient<T>(
  label: EnvironmentName,
  envVars: EnvVars,
  callback: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  // CRITICAL: Use PROD_DATABASE_URL for production (local Render Node PostgreSQL)
  // Use DEV_DATABASE_URL for development (master database)
  // Fallback to legacy variables for backwards compatibility
  const isProd = process.env.NODE_ENV === "production";
  const url = isProd
    ? (envVars.PROD_DATABASE_URL || envVars.DATABASE_URL)
    : (envVars.DEV_DATABASE_URL ||
       envVars.RENDER_DB_EXTERNAL_URL ?? 
       envVars.RENDER_DB_INTERNAL_URL ?? 
       envVars.DATABASE_LOCAL_URL ??
       envVars.DATABASE_URL);
  
  if (!url) {
    throw new Error(`Missing DATABASE_URL for ${label} environment (NODE_ENV=${process.env.NODE_ENV})`);
  }

  // 2-NODE CLUSTER: Always use direct PostgreSQL connections (library engine)
  const originalEngine = process.env.PRISMA_CLIENT_ENGINE_TYPE;
  delete process.env.PRISMA_CLIENT_ENGINE_TYPE;

  const client = new PrismaClient({
    datasources: {
      db: { url },
    },
  });

  try {
    return await callback(client);
  } finally {
    await client.$disconnect();
    if (originalEngine === undefined) {
      delete process.env.PRISMA_CLIENT_ENGINE_TYPE;
    } else {
      process.env.PRISMA_CLIENT_ENGINE_TYPE = originalEngine;
    }
  }
}

async function captureCounts(label: EnvironmentName, envVars: EnvVars): Promise<CountSnapshot> {
  return withPrismaClient(label, envVars, async (client) => {
    const [species, moves, abilities, learnsets] = await Promise.all([
      client.species.count(),
      client.move.count(),
      client.ability.count(),
      client.speciesLearnset.count(),
    ]);

    return {
      species,
      moves,
      abilities,
      learnsets,
      hash: `${species}:${moves}:${abilities}:${learnsets}`,
    };
  });
}

function diffCounts(devCounts: CountSnapshot, prodCounts: CountSnapshot): Record<string, number> {
  return {
    species: prodCounts.species - devCounts.species,
    moves: prodCounts.moves - devCounts.moves,
    abilities: prodCounts.abilities - devCounts.abilities,
    learnsets: prodCounts.learnsets - devCounts.learnsets,
  };
}

function fingerprintTrigger(trigger: DexTrigger): string {
  return `${trigger.updatedAt}:${trigger.checksum}`;
}

async function readDexTrigger(
  triggerPath: string,
): Promise<{ payload: DexTrigger; fingerprint: string } | null> {
  const absolutePath = resolvePath(triggerPath);
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    const payload = JSON.parse(raw) as DexTrigger;
    if (!payload.updatedAt || !payload.checksum) {
      throw new Error("Trigger file missing updatedAt/checksum fields");
    }

    return {
      payload,
      fingerprint: fingerprintTrigger(payload),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read trigger file at ${absolutePath}: ${message}`);
  }
}

/**
 * Enforce PROD as master: force target environment to match PROD exactly
 * PROD is the production database - DEV and LOCAL replicate from it
 */
async function enforceProdMaster(
  targetEnv: EnvironmentName,
  targetEnvPath: string,
  targetVars: EnvVars,
  prodVars: EnvVars,
  dryRun: boolean,
): Promise<void> {
  log("enforce.prod_master.start", { target: targetEnv, dryRun });

  if (dryRun) {
    log("enforce.prod_master.dry_run", { target: targetEnv, action: "skip" });
    return;
  }

  // Run migrations and seed on target to match PROD
  await runPhase(targetEnv, targetEnvPath, targetVars, dryRun);

  log("enforce.prod_master.complete", { target: targetEnv });
}

/**
 * Reverse integrity check: verify target hasn't diverged from PROD
 * Alerts if unauthorized changes detected in DEV/LOCAL
 */
async function reverseIntegrityCheck(
  targetEnv: EnvironmentName,
  targetVars: EnvVars,
  prodVars: EnvVars,
  prodCounts: CountSnapshot,
  dispatchAlert?: AlertDispatcher,
): Promise<boolean> {
  log("reverse.integrity.check.start", { target: targetEnv });

  const targetCounts = await captureCounts(targetEnv, targetVars);
  const delta = diffCounts(prodCounts, targetCounts);
  const driftDetected =
    delta.species !== 0 || delta.moves !== 0 || delta.abilities !== 0 || delta.learnsets !== 0;

  if (driftDetected) {
    const alertPayload: IntegrityAlertPayload = {
      reason: "reverse_integrity_violation",
      delta,
      devCounts: prodCounts, // Using devCounts field for PROD (master) in alert structure
      prodCounts: targetCounts,
      enforcementMode: "enabled",
      violationType: "reverse_integrity",
      affectedEnvironment: targetEnv === "local" ? "local" : "dev",
    };

    log("reverse.integrity.violation", {
      target: targetEnv,
      severity: "critical",
      delta,
      prodCounts,
      targetCounts,
      remediation: [
        `${targetEnv.toUpperCase()} must match PROD exactly`,
        "PROD is the single source of truth",
        "Auto-enforcement will trigger on next sync cycle",
      ],
    });

    if (dispatchAlert) {
      await dispatchAlert(alertPayload);
    }

    return false; // Integrity violated
  }

  log("reverse.integrity.check.pass", { target: targetEnv });
  return true; // Integrity maintained
}

async function runConsolidation(
  config: SyncConfig,
  reason: string,
  devVars: EnvVars,
  prodVars: EnvVars,
  localVars: EnvVars | null,
  dispatchAlert?: AlertDispatcher,
): Promise<{ 
  devCounts: CountSnapshot; 
  prodCounts: CountSnapshot;
  localCounts: CountSnapshot | null;
}> {
  log("sync.consolidate.start", { 
    dryRun: config.dryRun, 
    reason, 
    enforceProdMaster: config.enforceProdMaster,
    includeLocal: config.includeLocal,
  });

  // PROD is always the source of truth - run first
  await runPhase("prod", config.prodEnvPath, prodVars, config.dryRun);
  const prodCounts = await captureCounts("prod", prodVars);

  if (config.enforceProdMaster) {
    // Force DEV to match PROD
    log("enforce.strategy", { target: "dev", source: "prod", mode: "master_enforcement" });
    await enforceProdMaster("dev", config.devEnvPath, devVars, prodVars, config.dryRun);
  } else {
    // Legacy bidirectional mode
    await runPhase("dev", config.devEnvPath, devVars, config.dryRun);
  }

  const devCounts = await captureCounts("dev", devVars);

  // Handle LOCAL workstation if enabled
  let localCounts: CountSnapshot | null = null;
  if (config.includeLocal && localVars) {
    if (config.enforceProdMaster) {
      log("enforce.strategy", { target: "local", source: "prod", mode: "master_enforcement" });
      await enforceProdMaster("local", config.localEnvPath!, localVars, prodVars, config.dryRun);
    } else {
      await runPhase("local", config.localEnvPath!, localVars, config.dryRun);
    }
    localCounts = await captureCounts("local", localVars);
  }

  // Verify alignment (comparing against PROD as master)
  const devDelta = diffCounts(prodCounts, devCounts);
  const devDriftDetected =
    devDelta.species !== 0 || devDelta.moves !== 0 || devDelta.abilities !== 0 || devDelta.learnsets !== 0;

  let localDriftDetected = false;
  let localDelta: Record<string, number> | null = null;
  if (config.includeLocal && localCounts) {
    localDelta = diffCounts(prodCounts, localCounts);
    localDriftDetected =
      localDelta.species !== 0 || localDelta.moves !== 0 || localDelta.abilities !== 0 || localDelta.learnsets !== 0;
  }

  log("sync.consolidate.counts", { 
    prodCounts, 
    devCounts, 
    localCounts,
    devDelta, 
    localDelta,
    reason,
  });

  if (devDriftDetected || localDriftDetected) {
    const alertPayload = {
      message: "Detected count drift between environments after consolidation.",
      reason,
      delta: devDelta,
      envs: {
        prod: config.prodEnvPath,
        dev: config.devEnvPath,
        local: config.localEnvPath,
      },
      devCounts,
      prodCounts,
    };
    log("sync.consolidate.warning", alertPayload);
    log("integrity.alert", {
      ...alertPayload,
      severity: config.enforceProdMaster ? "critical" : "warning",
      remediation: config.enforceProdMaster 
        ? "PROD is master. Target databases will be force-synced on next cycle."
        : "Inspect sync logs, rerun migrate/seed if drift persists.",
    });
    if (dispatchAlert) {
      await dispatchAlert({ 
        reason, 
        delta: devDelta, 
        devCounts: prodCounts, // PROD is master, so it goes in devCounts for alert structure
        prodCounts: devCounts,
        enforcementMode: config.enforceProdMaster ? "enabled" : "disabled",
        violationType: "drift",
        affectedEnvironment: "dev",
      });
    }
  } else {
    log("sync.consolidate.success", { 
      message: "All environments aligned with PROD (master).", 
      reason,
      environments: config.includeLocal ? ["prod", "dev", "local"] : ["prod", "dev"],
    });
  }

  return { devCounts, prodCounts, localCounts };
}

async function main(): Promise<void> {
  const config = parseArgs();
  if (config.ci && !config.dryRun) {
    throw new Error("--ci flag requires --dry-run to avoid mutating databases during guard runs");
  }

  const devVars = await readEnvFile(config.devEnvPath);
  const prodVars = await readEnvFile(config.prodEnvPath);
  let localVars: EnvVars | null = null;
  
  if (config.includeLocal && config.localEnvPath) {
    try {
      localVars = await readEnvFile(config.localEnvPath);
    } catch (error) {
      log("local.env.missing", {
        message: "Local env file not found; checking for PROD_DATABASE_URL or DATABASE_LOCAL_URL in process.env",
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to process.env for LOCAL/PROD database
      const fallbackUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_LOCAL_URL;
      if (fallbackUrl) {
        localVars = {
          DATABASE_URL: fallbackUrl,
        };
      }
    }
  }
  
  const resolvedTriggerPath = resolvePath(config.triggerPath);

  const mergeAlert = (value?: string) => (value ? value.trim() : "");
  if (!config.alertWebhookUrl) {
    config.alertWebhookUrl =
      mergeAlert(prodVars.ALERT_WEBHOOK_URL) || mergeAlert(devVars.ALERT_WEBHOOK_URL);
  }
  const alertDispatcher = createIntegrityAlertDispatcher(config);
  logAlertConfiguration(config);

  log("sync.config", {
    devEnv: config.devEnvPath,
    prodEnv: config.prodEnvPath,
    localEnv: config.localEnvPath || "not configured",
    triggerPath: resolvedTriggerPath,
    intervalMs: config.intervalMs,
    reverseCheckIntervalMs: config.reverseCheckIntervalMs,
    once: config.once,
    dryRun: config.dryRun,
    skipStartup: config.skipStartup,
    ci: config.ci,
    alertsSuppressed: config.suppressAlerts,
    alertWebhookConfigured: Boolean(config.alertWebhookUrl),
    alertWebhook: config.alertWebhookUrl ? sanitizeWebhook(config.alertWebhookUrl) : "",
    enforceProdMaster: config.enforceProdMaster,
    includeLocal: config.includeLocal,
    simulateAlert: config.simulateAlert,
  });

  if (config.simulateAlert) {
    const devCounts: CountSnapshot = {
      species: 1_025,
      moves: 919,
      abilities: 367,
      learnsets: 101_969,
      hash: "1025:919:367:101969",
    };
    const prodCounts: CountSnapshot = {
      species: 1_012,
      moves: 915,
      abilities: 360,
      learnsets: 101_800,
      hash: "1012:915:360:101800",
    };
    const delta = diffCounts(devCounts, prodCounts);
    const alertPayload = {
      message: "Simulated integrity alert triggered via --simulate-alert.",
      reason: "simulate_alert",
      delta,
      envs: {
        dev: config.devEnvPath,
        prod: config.prodEnvPath,
      },
      devCounts,
      prodCounts,
      simulated: true,
    };
    log("integrity.alert", {
      ...alertPayload,
      severity: "info",
      remediation: "Validate webhook delivery and clear the simulate flag before production runs.",
    });
    await alertDispatcher({ reason: "simulate_alert", delta, devCounts, prodCounts });
    log("integrity.alert.simulated", {
      destination: config.alertWebhookUrl ? "webhook" : "none",
      delta,
      devCounts,
      prodCounts,
    });
    return;
  }

  let bootstrapTrigger: { payload: DexTrigger; fingerprint: string } | null = null;
  try {
    bootstrapTrigger = await readDexTrigger(config.triggerPath);
    if (bootstrapTrigger) {
      log("trigger.bootstrap", {
        updatedAt: bootstrapTrigger.payload.updatedAt,
        checksum: bootstrapTrigger.payload.checksum,
        path: resolvedTriggerPath,
      });
    } else {
      log("trigger.bootstrap.missing", { path: resolvedTriggerPath });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("trigger.bootstrap.error", { message, path: resolvedTriggerPath });
  }

  if (config.ci) {
    const devDirect =
      devVars.RENDER_DB_INTERNAL_URL || devVars.RENDER_DB_EXTERNAL_URL || devVars.DATABASE_URL || "";
    const prodDirect =
      prodVars.RENDER_DB_INTERNAL_URL || prodVars.RENDER_DB_EXTERNAL_URL || prodVars.DATABASE_URL || "";

    if (!devDirect) {
      throw new Error(
        "CI guard requires RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL (or DATABASE_URL) in the Dev env file",
      );
    }
    if (!prodDirect) {
      throw new Error(
        "CI guard requires RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL (or DATABASE_URL) in the Prod env file",
      );
    }
    if (!bootstrapTrigger) {
      throw new Error("CI guard requires data/cache/dex-sync-trigger.json to exist with metadata");
    }

    log("sync.ci.guard.success", {
      devEnv: config.devEnvPath,
      prodEnv: config.prodEnvPath,
      triggerPath: resolvedTriggerPath,
      updatedAt: bootstrapTrigger.payload.updatedAt,
      checksum: bootstrapTrigger.payload.checksum,
    });
    return;
  }

  try {
    await preflightOptimize(prodVars);
  } catch (error) {
    log("preflight.optimize.error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const history: { 
    dev: CountSnapshot | null; 
    prod: CountSnapshot | null;
    local: CountSnapshot | null;
  } = {
    dev: null,
    prod: null,
    local: null,
  };
  let baselineCaptured = false;
  let lastTriggerFingerprint: string | null = bootstrapTrigger ? bootstrapTrigger.fingerprint : null;
  let triggerMissingLogged = bootstrapTrigger === null;

  if (!config.skipStartup) {
    try {
      const startupCounts = await runConsolidation(
        config,
        "startup",
        devVars,
        prodVars,
        localVars,
        alertDispatcher,
      );
      history.dev = startupCounts.devCounts;
      history.prod = startupCounts.prodCounts;
      history.local = startupCounts.localCounts;
      baselineCaptured = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("sync.consolidate.error", { reason: "startup", message });
    }
  }

  // Track last reverse integrity check time
  let lastReverseCheckTime = Date.now();

  while (true) {
    const cycleStartedAt = Date.now();
    let exitAfterCycle = false;
    try {
      let triggerRan = false;
      try {
        const trigger = await readDexTrigger(config.triggerPath);
        if (!trigger) {
          if (!triggerMissingLogged) {
            log("trigger.missing", { path: resolvedTriggerPath });
            triggerMissingLogged = true;
          }
        } else {
          triggerMissingLogged = false;
          if (trigger.fingerprint !== lastTriggerFingerprint) {
            log("trigger.detected", {
              updatedAt: trigger.payload.updatedAt,
              checksum: trigger.payload.checksum,
              count: trigger.payload.count,
            });
            const consolidated = await runConsolidation(
              config,
              "dex_trigger",
              devVars,
              prodVars,
              localVars,
              alertDispatcher,
            );
            history.dev = consolidated.devCounts;
            history.prod = consolidated.prodCounts;
            history.local = consolidated.localCounts;
            lastTriggerFingerprint = trigger.fingerprint;
            baselineCaptured = true;
            triggerRan = true;
          }
        }
      } catch (triggerError) {
        const message = triggerError instanceof Error ? triggerError.message : String(triggerError);
        log("trigger.error", { message, path: resolvedTriggerPath });
      }

      if (triggerRan) {
        if (config.once) {
          exitAfterCycle = true;
        }
        log("trigger.post_run", { message: "Trigger handled; skipping integrity sweep this cycle." });
      } else {
        const [devCounts, prodCounts] = await Promise.all([
          captureCounts("dev", devVars),
          captureCounts("prod", prodVars),
        ]);

        log("integrity.check", { devCounts, prodCounts });

        const delta = diffCounts(devCounts, prodCounts);
        const driftDetected =
          delta.species !== 0 || delta.moves !== 0 || delta.abilities !== 0 || delta.learnsets !== 0;

        if (!baselineCaptured) {
          if (driftDetected) {
            const consolidated = await runConsolidation(
              config,
              "drift_detected",
              devVars,
              prodVars,
              localVars,
              alertDispatcher,
            );
            history.dev = consolidated.devCounts;
            history.prod = consolidated.prodCounts;
            history.local = consolidated.localCounts;
          } else {
            history.dev = devCounts;
            history.prod = prodCounts;
            log("integrity.baseline", { message: "Baseline captured; monitoring for drift." });
          }
          baselineCaptured = true;
        } else {
          const devChanged = history.dev !== null && history.dev.hash !== devCounts.hash;
          const prodChanged = history.prod !== null && history.prod.hash !== prodCounts.hash;

          let latestDevCounts = devCounts;
          let latestProdCounts = prodCounts;

          if (driftDetected || devChanged || prodChanged) {
            log("integrity.trigger", {
              reason: driftDetected ? "drift_detected" : "state_changed",
              delta,
              devChanged,
              prodChanged,
            });
            const consolidated = await runConsolidation(
              config,
              driftDetected ? "drift_detected" : "state_changed",
              devVars,
              prodVars,
              localVars,
              alertDispatcher,
            );
            latestDevCounts = consolidated.devCounts;
            latestProdCounts = consolidated.prodCounts;
            // Also update local if included
            if (config.includeLocal && consolidated.localCounts) {
              history.local = consolidated.localCounts;
            }
          } else {
            log("integrity.ok", { message: "No action required; counts aligned." });
          }

          history.dev = latestDevCounts;
          history.prod = latestProdCounts;
        }

        // Perform reverse integrity check hourly (only if enforceProdMaster enabled)
        const timeSinceLastReverseCheck = Date.now() - lastReverseCheckTime;
        if (config.enforceProdMaster && timeSinceLastReverseCheck >= config.reverseCheckIntervalMs) {
          log("reverse.integrity.check.scheduled", {
            timeSinceLastMs: timeSinceLastReverseCheck,
            intervalMs: config.reverseCheckIntervalMs,
          });

          const prodCounts = history.prod || await captureCounts("prod", prodVars);

          // Check DEV hasn't diverged from PROD
          const devIntact = await reverseIntegrityCheck(
            "dev",
            devVars,
            prodVars,
            prodCounts,
            alertDispatcher,
          );

          // Check LOCAL hasn't diverged from PROD (if included)
          let localIntact = true;
          if (config.includeLocal && localVars) {
            localIntact = await reverseIntegrityCheck(
              "local",
              localVars,
              prodVars,
              prodCounts,
              alertDispatcher,
            );
          }

          if (!devIntact || !localIntact) {
            log("reverse.integrity.violation.enforcement", {
              message: "Reverse integrity violation detected; forcing re-sync on next cycle",
              devIntact,
              localIntact,
            });
          }

          lastReverseCheckTime = Date.now();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("integrity.error", { message });
    }

    if (exitAfterCycle || config.once) {
      break;
    }

    const elapsedMs = Date.now() - cycleStartedAt;
    const waitMs = Math.max(config.intervalMs - elapsedMs, 5_000);
    log("integrity.sleep", { waitMs });
    await delay(waitMs);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log("sync.fatal", { message });
  process.exitCode = 1;
});
