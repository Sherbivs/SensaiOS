export type CliLogLevel = "success" | "info" | "detail" | "warn" | "error";
export interface CliLogOptions {
  debugMode?: boolean;
}
export const LOG_LABEL: Record<CliLogLevel, string>;

export interface LogFunction {
  (level: CliLogLevel, message: string, context?: unknown, options?: CliLogOptions): void;
  info(message: string, context?: unknown, options?: CliLogOptions): void;
  warn(message: string, context?: unknown, options?: CliLogOptions): void;
  error(message: string, context?: unknown, options?: CliLogOptions): void;
  success(message: string, context?: unknown, options?: CliLogOptions): void;
  detail(message: string, context?: unknown, options?: CliLogOptions): void;
}

export const log: LogFunction;

export function report(title: string, meta?: Record<string, unknown> | null, level?: CliLogLevel): void;
export function startAutoRefresh(): void;
export function stopAutoRefresh(): void;
export function getFormattedStats(): string;
