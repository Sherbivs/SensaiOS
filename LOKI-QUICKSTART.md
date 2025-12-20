# Grafana Loki Integration — Quick Start

## What Was Built

**Full Grafana Loki stack** for forwarding **production logs from Render cloud servers** to your local machine for monitoring.

**⚠️ LOGS COME FROM RENDER PRODUCTION (CLOUD), NOT LOCAL BOT**

Your local machine only runs the log viewer (Grafana + Loki). The actual logs come from the Discord bot running on Render 24/7.

### Files Created

1. **Docker Stack** — `docker-compose.loki.yml`
   - Grafana (UI for querying logs)
   - Loki (log aggregation)
   - Promtail (log shipping)

2. **Loki Configuration** — `ops/loki-config.yaml`
   - Ingestion limits: 50 MB/s
   - Retention: 7 days
   - HTTP API enabled

3. **Grafana Datasource** — `ops/grafana-datasources.yml`
   - Loki datasource preconfigured
   - Prometheus support ready

4. **Promtail Config** — `ops/promtail-config.yaml`
   - JSON log parsing
   - Label extraction (level, service, correlationId)

5. **Loki Transport** — `src/shared/logging/loki-transport.ts`
   - Batching (100 logs or 5 seconds)
   - Retry logic
   - Graceful degradation

6. **Logger Integration** — `src/shared/logger.ts`
   - Automatic forwarding to Loki
   - Non-blocking (won't slow down app)

7. **Setup Guide** — `docs/operations-bible/loki-setup.md`
   - Step-by-step instructions
   - Query examples
   - Troubleshooting

## How to Use

### Step 1: Start Local Stack
```powershell
docker-compose -f docker-compose.loki.yml up -d
```

### Step 2: Expose with ngrok
```powershell
ngrok http 3100
# Copy the HTTPS URL (e.g., https://abc123.ngrok-free.app)
```

### Step 3: Configure Render
1. Go to: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Add environment variable:
   - Key: `LOKI_ENDPOINT`
   - Value: `https://abc123.ngrok-free.app` (your ngrok URL)
3. Save (triggers redeploy)

### Step 4: View Logs in Grafana
1. Open: http://localhost:3000 (admin/admin)
2. Go to **Explore** → **Loki**
3. Query: `{job="infinity-gauntlet"}`

## Query Examples

```logql
# All errors
{level="error"}

# Battle logs with duration > 1s
{service="battle"} | json | durationMs > 1000

# User activity
{userId="123456789"}

# Correlation tracking
{correlationId="abc-123"}
```

## Architecture

```
☁️ Render Cloud (Production Bot - 24/7)
  └─> src/shared/logger.ts (runs on Render)
       ├─> TimescaleDB (database-first)
       ├─> Console (Render stdout)
       └─> Loki Transport (HTTP POST)
            └─> 🌐 ngrok tunnel (public URL)
                 └─> 💻 Your Local Machine
                      ├─> Loki (localhost:3100) receives logs
                      └─> Grafana UI (localhost:3000) displays logs
```

**Key Point:** The bot runs on Render (cloud). Your machine just receives and displays the logs.

## Cost: $0/month

- Local Docker: Free
- ngrok Free tier: 2-hour sessions (manual restart)
- Loki storage: Your local disk

## Next Steps

1. Start Docker stack
2. Start ngrok
3. Add `LOKI_ENDPOINT` to Render
4. Watch logs flow in Grafana

Full instructions: `docs/operations-bible/loki-setup.md`

---

**Status:** ✅ Ready to deploy
**Build:** ✅ Passing
**Deployment:** Add `LOKI_ENDPOINT` env var to Render
