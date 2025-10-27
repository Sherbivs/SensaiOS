declare module "../utils/logger.js" {
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
  const _default: {
    LOG_LABEL: typeof LOG_LABEL;
    log: typeof log;
    report: typeof report;
  };
  export default _default;
}
