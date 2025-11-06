import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { log } from "../shared/log.js";

const RESTART_DELAY_MS = 30_000;

export function startAutoSyncSupervisor(): () => void {
  const scriptPath = path.resolve(process.cwd(), "scripts", "dev_prod_auto_sync.ts");
  let child: ChildProcess | null = null;
  let restartTimer: NodeJS.Timeout | null = null;
  let stopping = false;

  const spawnChild = (): void => {
    if (stopping) {
      return;
    }

    log.info("Starting auto-sync loop", { scriptPath });

    child = spawn(process.execPath, ["--import", "tsx/esm", scriptPath], {
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
          error: error instanceof Error ? error.message : String(error),
        });
      }
      child = null;
    }
  };
}
