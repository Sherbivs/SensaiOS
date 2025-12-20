# Grafana Loki Setup — Infinity Gauntlet Log Forwarding

## Overview

Forward **production logs from Render cloud servers** to your local Grafana Loki stack for real-time monitoring and querying.

**⚠️ CRITICAL:** Logs come from **Render production deployment**, NOT local development. Your local machine only runs Loki + Grafana to receive and display logs.

**Architecture:**
```
☁️ Render Cloud (Production Bot Running 24/7)
  └─> src/shared/logger.ts (runs on Render)
       ├─> TimescaleDB (database-first)
       ├─> Console (Render stdout)
       └─> Loki Transport (HTTP POST)
            └─> 🌐 Internet (ngrok tunnel)
                 └─> 💻 Your Local Machine
                      ├─> Loki (receives logs)
                      └─> Grafana (queries logs)
```

**What runs where:**
- **Render (Cloud):** Discord bot + Logger + Loki Transport
- **Your Machine:** Loki + Grafana + ngrok tunnel
- **ngrok:** Creates public URL so Render can reach your local Loki

## Prerequisites

- Docker Desktop installed and running
- Port 3000 (Grafana) and 3100 (Loki) available
- ngrok installed (for exposing local Loki to Render)

## Quick Start

### 1. Start Local Loki Stack (On Your Machine)

```powershell
# Start Loki + Grafana + Promtail (runs locally to receive logs)
docker-compose -f docker-compose.loki.yml up -d

# Verify containers running
docker ps | Select-String "loki|grafana"

# Check Loki is ready to receive logs
curl http://localhost:3100/ready
```

### 2. Expose Loki to Internet (ngrok tunnel)

**Why?** Render (cloud) needs a public URL to reach your local Loki instance.

```powershell
# Install ngrok (if needed)
winget install ngrok.ngrok

# Authenticate ngrok (get token from https://dashboard.ngrok.com)
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start ngrok tunnel (exposes local port 3100 to internet)
ngrok http 3100
```

**Copy the Forwarding URL** (e.g., `https://abc123.ngrok-free.app`)  
This is the public URL Render will use to send logs to your machine.

### 3. Configure Render (Cloud Bot)

**This tells the production bot where to send logs:**

1. Go to: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Navigate to: **Environment** tab
3. Add new variable:
   - **Key:** `LOKI_ENDPOINT`
   - **Value:** `https://abc123.ngrok-free.app` (your ngrok public URL)
4. Click **Save Changes** (triggers automatic redeploy with new config)

**After redeploy:** Every log from Render production → sent to your local Loki → visible in Grafana

### 4. Access Grafana (View Production Logs)

**All logs you see here come from Render cloud production, not local development.**

1. Open: http://localhost:3000
2. Login: `admin` / `admin` (change password on first login)
3. Navigate to: **Explore** → Select **Loki** datasource
4. Query examples:
   ```logql
   {job="infinity-gauntlet"} |= "error"
   {level="error", service="bot"}
   {service="battle"} | json | line_format "{{.message}}"
   ```

**What you're seeing:**
- Real-time logs from Render production deployment
- Every Discord command, battle, encounter happening live
- Errors, warnings, and debug logs from cloud servers

## Log Query Examples

### Recent Errors
```logql
{job="infinity-gauntlet", level="error"} | json | line_format "{{.timestamp}} {{.message}}"
```

### Battle Logs
```logql
{service="battle"} | json | duration > 1000ms
```

### User Activity
```logql
{job="infinity-gauntlet"} | json | userId="123456789"
```

### Correlation Tracking
```logql
{job="infinity-gauntlet"} | json | correlationId="abc-123-def"
```

## Production Deployment Checklist

- [ ] Docker containers running (`docker ps`)
- [ ] ngrok tunnel active (`ngrok http 3100`)
- [ ] `LOKI_ENDPOINT` env var set in Render
- [ ] Service redeployed with new env var
- [ ] Grafana accessible at http://localhost:3000
- [ ] Test query shows logs from Render

## Monitoring

### Check Loki Ingestion
```powershell
# Loki metrics
curl http://localhost:3100/metrics | Select-String "loki_ingester"

# Recent log streams
curl "http://localhost:3100/loki/api/v1/label/job/values"
```

### Check Container Logs
```powershell
# Loki container logs
docker logs infinity-gauntlet-loki --tail 50

# Grafana container logs
docker logs infinity-gauntlet-grafana --tail 50
```

## Troubleshooting

### No Logs Appearing

1. **Check ngrok tunnel is active:**
   ```powershell
   curl https://your-ngrok-url.ngrok-free.app/ready
   ```

2. **Verify Render env var:**
   ```powershell
   # SSH into Render
   wsl ssh render-virginia
   echo $LOKI_ENDPOINT
   ```

3. **Check Loki ingestion:**
   ```powershell
   docker logs infinity-gauntlet-loki | Select-String "push"
   ```

### High Memory Usage

Loki default config limits:
- Max ingestion: 50 MB/s
- Max burst: 100 MB
- Retention: 168 hours (7 days)

Adjust in `ops/loki-config.yaml` if needed.

### ngrok Session Expired

Free ngrok sessions expire after 2 hours. Options:
1. Restart ngrok manually
2. Upgrade to paid plan (persistent URLs)
3. Use alternative tunnel (Cloudflare Tunnel, Tailscale)

## Alternative: Permanent Loki Setup

### Option 1: Render-Hosted Loki

Deploy Loki as a Render service (same region as bot):

```yaml
# render.yaml
services:
  - type: web
    name: infinity-gauntlet-loki
    env: docker
    dockerfilePath: ./ops/Dockerfile.loki
    healthCheckPath: /ready
    disk:
      name: loki-data
      mountPath: /loki
      sizeGB: 10
    envVars:
      - key: LOKI_ENDPOINT
        value: https://infinity-gauntlet-loki.onrender.com
```

**Pros:** No ngrok needed, persistent URL, same datacenter
**Cons:** Extra Render service cost (~$7/month for 512 MB)

### Option 2: Tailscale VPN

Connect Render → Home Network directly:

1. Install Tailscale on Render worker
2. Add to your Tailnet
3. Use private IP for `LOKI_ENDPOINT`

**Pros:** Secure, no public exposure, permanent
**Cons:** Requires Tailscale setup, VPN overhead

## Cost Analysis

### Free Setup (Current)
- Loki: Local Docker (free)
- Grafana: Local Docker (free)
- ngrok: Free tier (2-hour sessions)
- **Total:** $0/month

### Production Setup (Render-Hosted Loki)
- Loki Service: $7/month (Starter 512 MB)
- Disk: $0.25/GB/month (10 GB = $2.50)
- **Total:** ~$9.50/month

### Enterprise Setup (Grafana Cloud)
- Grafana Cloud: $0/month (free tier: 50 GB logs)
- **Total:** $0/month (50 GB included)

## References

- Loki Docs: https://grafana.com/docs/loki/latest/
- LogQL Query Language: https://grafana.com/docs/loki/latest/logql/
- Grafana Dashboards: http://localhost:3000/dashboards
- ngrok Docs: https://ngrok.com/docs

---

**Created:** 2025-12-20
**Status:** ACTIVE — Local setup with ngrok tunnel
