import process from "node:process";
import { config as loadEnv } from "dotenv";
import fetch from "node-fetch";

interface Options {
  envFile?: string;
  webhook?: string;
  metric: string;
  value: number;
  threshold: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    metric: "dex.metrics.lookup_p99",
    value: 0.00062,
    threshold: 0.0005,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--env-file":
        options.envFile = argv[++i];
        break;
      case "--webhook":
        options.webhook = argv[++i];
        break;
      case "--metric":
        options.metric = argv[++i] || options.metric;
        break;
      case "--value":
        options.value = Number(argv[++i]);
        break;
      case "--threshold":
        options.threshold = Number(argv[++i]);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  return options;
}

async function ensureEnvLoaded(envFile?: string) {
  if (envFile) {
    loadEnv({ path: envFile, override: true });
    return;
  }

  const fallback = process.env.IG_ENV_FILE;
  if (fallback) {
    loadEnv({ path: fallback, override: false });
  }
}

async function sendAlert(options: Options, webhookUrl: string) {
  const now = new Date().toISOString();
  const payload = {
    username: "Infinity Ops",
    content: "🛠️ DEX v2 canary alert dry-run",
    embeds: [
      {
        title: "DEX v2 Canary Alert",
        description: "Dry-run payload to validate observability routing.",
        color: 0x1e90ff,
        fields: [
          { name: "Metric", value: options.metric, inline: true },
          { name: "Observed", value: `${options.value}`, inline: true },
          { name: "Threshold", value: `${options.threshold}`, inline: true },
          { name: "Dry Run", value: "true", inline: true },
        ],
        footer: { text: "Trigger: dex.metrics lookup latency" },
        timestamp: now,
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook returned ${response.status}: ${text}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureEnvLoaded(options.envFile);

  const webhookUrl = options.webhook || process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Provide --webhook or set ALERT_WEBHOOK_URL to dispatch the dry-run alert.");
  }

  if (options.dryRun) {
    console.log("[DRY-RUN] Would send alert payload", {
      metric: options.metric,
      value: options.value,
      threshold: options.threshold,
      webhook: `${webhookUrl.slice(0, 20)}…`,
    });
    return;
  }

  await sendAlert(options, webhookUrl);
  console.log("Alert webhook dispatched successfully.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
