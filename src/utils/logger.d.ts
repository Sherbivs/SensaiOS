export type CliLogLevel = "success" | "info" | "detail" | "warn" | "error";
export interface CliLogOptions {
  debugMode?: boolean;
}
export const LOG_LABEL: Record<CliLogLevel, string>;
export function log(
  level: CliLogLevel,
  message: string,
  context?: unknown,
  options?: CliLogOptions
): void;
export function report(title: string, meta?: Record<string, unknown> | null, level?: CliLogLevel): void;
export function startAutoRefresh(): void;
export function stopAutoRefresh(): void;
export function getFormattedStats(): string;
