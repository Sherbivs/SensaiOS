import { spawn } from "node:child_process";
import path from "node:path";
import { log } from "../shared/log.js";
import { getErrorMessage } from "../shared/utils/error-utils.js";
const RESTART_DELAY_MS = 30_000;
export function startAutoSyncSupervisor() {
    const scriptPath = path.resolve(process.cwd(), "scripts", "dev_prod_auto_sync.ts");
    let child = null;
    let restartTimer = null;
    let stopping = false;
    const spawnChild = () => {
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
            }
            catch (error) {
                log.warn("Failed to terminate auto-sync process", {
                    error: getErrorMessage(error),
                });
            }
            child = null;
        }
    };
}
