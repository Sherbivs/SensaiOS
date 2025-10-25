// Centralized configuration loader with safe defaults.
// Never log secrets. Only read from process.env.

export type AppConfig = {
  env: "development" | "test" | "production";
  databaseUrl: string;
  nodeEnvRaw: string | undefined;
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  env:
    (process.env.NODE_ENV as AppConfig["env"]) ||
    (process.env.RENDER === "true" ? "production" : "development"),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  nodeEnvRaw: process.env.NODE_ENV,
};
