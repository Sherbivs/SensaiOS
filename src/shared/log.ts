// Minimal structured logger without external deps.
// Outputs JSON lines with timestamp, level, message, and optional context.

import { config } from "./config.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  // Default more verbose in development/test, quieter in production.
  return config.env === "production" ? "info" : "debug";
}

let currentLevel: LogLevel = envLevel();

function enabled(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel];
}

type AnyObj = Record<string, unknown> | undefined;

function safeError(err: unknown): AnyObj {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === "object") return err as Record<string, unknown>;
  return { value: String(err) };
}

function nowIso(): string {
  return new Date().toISOString();
}

function write(obj: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(obj));
}

export const log = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(msg: string, meta?: AnyObj) {
    if (!enabled("debug")) return;
    write({ t: nowIso(), level: "debug", msg, env: config.env, ...meta });
  },

  info(msg: string, meta?: AnyObj) {
    if (!enabled("info")) return;
    write({ t: nowIso(), level: "info", msg, env: config.env, ...meta });
  },

  warn(msg: string, meta?: AnyObj) {
    if (!enabled("warn")) return;
    write({ t: nowIso(), level: "warn", msg, env: config.env, ...meta });
  },

  error(msg: string, err?: unknown, meta?: AnyObj) {
    if (!enabled("error")) return;
    const errorObj = safeError(err);
    write({ t: nowIso(), level: "error", msg, env: config.env, err: errorObj, ...meta });
  },

  // For unit tests: produce the object without writing it
  _format(level: LogLevel, msg: string, err?: unknown, meta?: AnyObj) {
    const errorObj = level === "error" ? safeError(err) : undefined;
    return { t: "<iso>", level, msg, env: config.env, err: errorObj, ...meta };
  },
};
