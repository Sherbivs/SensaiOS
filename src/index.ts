import { config } from "./shared/config.js";
import { log } from "./shared/log.js";
import cliStatus from "./utils/cliStatus.js";
import type { Client } from "discord.js";
import { Prisma } from "@prisma/client";
import { initPrisma, prisma } from "./models/index.js";
import { bootDiscord } from "./bot/index.js";

const CLI_MONITOR_DISABLED =
  process.env.DISABLE_CLI_MONITOR === "true" || process.env.NODE_ENV === "test";

type ShutdownTrigger = NodeJS.Signals | "uncaughtException";

let monitorActive = false;
let shuttingDown = false;
let signalsInstalled = false;
let activeClient: Client | null = null;
let warningsInstalled = false;

function withMonitor(callback: (monitor: typeof cliStatus) => void): void {
  if (!monitorActive) {
    return;
  }
  try {
    callback(cliStatus);
  } catch (error) {
    monitorActive = false;
    log.warn("CLI monitor disabled after write failure", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function startMonitor(): void {
  if (CLI_MONITOR_DISABLED || monitorActive) {
    return;
  }
  try {
    cliStatus.startStatusDisplay();
    monitorActive = true;
    setPhase("Booting");
    setSection("database", { title: "Database", status: "checking", metrics: [] });
    setSection("discord", { title: "Discord Bot", status: "initializing", metrics: [] });
  } catch (error) {
    monitorActive = false;
    log.warn("CLI monitor unavailable; continuing without interactive dashboard", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function stopMonitor(): void {
  if (!monitorActive) {
    return;
  }
  try {
    cliStatus.stopStatusDisplay();
  } catch {}
  monitorActive = false;
}

function setPhase(phase: string): void {
  withMonitor((monitor) => {
    monitor.setPhase(phase);
  });
}

function setGuildCount(count: number): void {
  withMonitor((monitor) => {
    monitor.setGuildCount(count);
  });
}

type SectionPayload = Parameters<typeof cliStatus.setSection>[1];

function setSection(sectionId: string, payload: SectionPayload): void {
  withMonitor((monitor) => {
    monitor.setSection(sectionId, payload);
  });
}

function isClientReady(client: Client): boolean {
  if (typeof client.isReady === "function") {
    return client.isReady();
  }
  return Boolean((client as { readyAt?: Date }).readyAt);
}

function updateDiscordSection(client: Client, status: string): void {
  if (!monitorActive) {
    return;
  }
  const guildCount = client.guilds?.cache?.size ?? 0;
  const metrics: SectionPayload["metrics"] = [
    ["identity", client.user?.tag ?? "unknown"],
    ["guilds", guildCount],
  ];
  const ping = (client as { ws?: { ping?: number } }).ws?.ping;
  if (typeof ping === "number" && Number.isFinite(ping)) {
    metrics.push(["ping", `${Math.round(ping)}ms`]);
  }
  setSection("discord", { title: "Discord Bot", status, metrics });
  setGuildCount(guildCount);
}

function bindDiscordLifecycle(client: Client): void {
  const updateOnline = () => updateDiscordSection(client, "online");
  client.on("guildCreate", updateOnline);
  client.on("guildDelete", updateOnline);
  client.on("shardDisconnect", () => updateDiscordSection(client, "reconnecting"));
  client.on("shardResume", updateOnline);
}

async function gracefulShutdown(signal: ShutdownTrigger): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  setPhase(`Shutting down (${signal})`);
  log.warn("Shutdown requested", { signal });

  try {
    await prisma.$disconnect();
  } catch (error) {
    log.error("Error during Prisma disconnect", error);
  }

  if (activeClient) {
    try {
      await activeClient.destroy();
    } catch (error) {
      log.error("Error during Discord client destroy", error);
    }
    activeClient = null;
  }

  stopMonitor();

  if (signal === "uncaughtException") {
    process.exit(1);
    return;
  }
  process.exit(0);
}

function installSignalHandlers(): void {
  if (signalsInstalled) {
    return;
  }
  signalsInstalled = true;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void gracefulShutdown(signal);
    });
  }

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    log.error("Unhandled promise rejection", error);
  });

  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", error);
    void gracefulShutdown("uncaughtException");
  });
}

function installWarningHandler(): void {
  if (warningsInstalled) {
    return;
  }
  warningsInstalled = true;

  // Node.js warning events cover deprecations and runtime issues. When at least one
  // listener is registered, the default stderr output is suppressed (per official
  // docs: https://nodejs.org/api/process.html#event-warning). We re-emit them
  // through the shared logger so Render background workers surface them inside the
  // CLI monitor instead of raw stack dumps that interrupt the dashboard layout.
  process.on("warning", (warning) => {
    log.warn(warning.message, {
      source: "process.warning",
      code: warning.code,
      detail: warning.detail,
      name: warning.name,
      stack: warning.stack,
    });
  });
}

export async function boot(): Promise<void> {
  installWarningHandler();
  installSignalHandlers();
  startMonitor();

  log.info("Infinity Gauntlet: toolchain online", { env: config.env });

  const dbStart = process.hrtime.bigint();
  setSection("database", { title: "Database", status: "connecting", metrics: [] });
  try {
    await initPrisma();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const dbDurationMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
    setSection("database", {
      title: "Database",
      status: "online",
      metrics: [["latency", `${dbDurationMs.toFixed(0)}ms`]],
    });
    log.info("Database connectivity OK");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("database", {
      title: "Database",
      status: "error",
      metrics: [["error", message]],
    });
    setPhase("Startup failed");
    log.error("Database connectivity failed", error, {
      remediation: [
        "On Render, ensure render.yaml sets envVars.DATABASE_URL fromDatabase.connectionString (internal).",
        "For workers, confirm service type is 'Background Worker' and it references the same DB.",
      ],
    });
    throw error;
  }

  setPhase("Connecting to Discord");
  setSection("discord", { title: "Discord Bot", status: "connecting", metrics: [] });

  try {
    const client = await bootDiscord();
    if (!isClientReady(client)) {
      setSection("discord", {
        title: "Discord Bot",
        status: "disabled",
        metrics: [["note", "Token missing or bot disabled"]],
      });
      setPhase("Idle");
      return;
    }

    activeClient = client;
    updateDiscordSection(client, "online");
    bindDiscordLifecycle(client);
    setPhase("Online");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSection("discord", {
      title: "Discord Bot",
      status: "error",
      metrics: [["error", message]],
    });
    setPhase("Startup failed");
    log.error("Discord bot startup failed", error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    log.error("Fatal during boot", err);
    process.exit(1);
  });
}
