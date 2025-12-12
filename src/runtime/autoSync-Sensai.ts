import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { log } from "../shared/log.js";
import { getErrorMessage } from "../shared/utils/error-utils.js";

const RESTART_DELAY_MS = 30_000;

/**
 * Check if we're running in unified database architecture (single database for all envs).
 * In this mode, auto-sync is not needed and should be completely disabled.
 */
function isUnifiedArchitecture(): boolean {
  // In unified architecture, PROD_DATABASE_URL is the only database
  // and there's no separate DEV database to sync with
  const prodUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  const devEnvPath = process.env.DEV_ENV_PATH;
  const prodEnvPath = process.env.PROD_ENV_PATH;
  
  // If no separate env file paths are configured, we're in unified mode
  // (production uses process.env directly, not separate files)
  if (!devEnvPath && !prodEnvPath && prodUrl) {
    return true;
  }
  
  return false;
}

export function startAutoSyncSupervisor(): () => void {
  // OPTIMIZATION: Skip auto-sync entirely in unified architecture
  // This prevents spawning processes every 30s that immediately exit
  if (isUnifiedArchitecture()) {
    log.info("⏭️ Auto-sync supervisor disabled (unified database architecture)", {
      reason: "Single database mode - no DEV/PROD sync needed",
      prodUrl: process.env.PROD_DATABASE_URL ? "configured" : "missing",
    });
    return () => {}; // No-op shutdown function
  }

  const scriptPath = path.resolve(process.cwd(), "scripts", "dev_prod_auto_sync.ts");
  let child: ChildProcess | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let stopping = false;

  const spawnChild = (): void => {
    if (stopping) {
      return;
    }

    // Build args array with env file paths if provided
    const args = ["--import", "tsx/esm", scriptPath];
    
    // Use env file paths if explicitly provided (local development)
    const devEnvPath = process.env.DEV_ENV_PATH;
    const prodEnvPath = process.env.PROD_ENV_PATH;
    
    if (devEnvPath) {
      args.push("--dev-env", devEnvPath);
    }
    if (prodEnvPath) {
      args.push("--prod-env", prodEnvPath);
    }
    
    // Always run in --once mode; supervisor handles the restart interval
    args.push("--once");
    
    log.info("Starting auto-sync loop", { 
      scriptPath, 
      args, 
      env: process.env.NODE_ENV,
      hasDevEnvPath: Boolean(devEnvPath),
      hasProdEnvPath: Boolean(prodEnvPath),
    });

    child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        AUTO_SYNC_BACKGROUND: "1",
      },
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });

    child.on("error", (error) => {
      if (stopping) {
        return;
      }
      log.error("Auto-sync process error", error);
    });

    child.on("exit", (code, signal) => {
      if (stopping) {
        return;
      }
      log.warn("Auto-sync process exited", { code, signal });
      restartTimer = setTimeout(spawnChild, RESTART_DELAY_MS);
    });
  };

  spawnChild();

  return () => {
    stopping = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (child) {
      child.removeAllListeners("exit");
      try {
        child.kill("SIGTERM");
      } catch (error) {
        log.warn("Failed to terminate auto-sync process", {
          error: getErrorMessage(error),
        });
      }
      child = null;
    }
  };
}
