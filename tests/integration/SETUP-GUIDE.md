# Week 4 Day 22: Integration Testing Setup Guide

## Objective
Set up local Prometheus + Grafana stack for integration testing of Discord Security Bot metrics.

## Prerequisites
- Docker Desktop installed (Windows)
- Discord bot running locally with metrics enabled (`npm run dev`)
- Port 9090 available for Prometheus
- Port 3000 available for Grafana (optional)

## Step 1: Start Prometheus Server

### Using Docker (Recommended)

```powershell
# Navigate to integration tests directory
cd tests/integration

# Start Prometheus with custom config
docker run -d `
  --name prometheus-integration `
  -p 9091:9090 `
  -v ${PWD}/prometheus.yml:/etc/prometheus/prometheus.yml `
  prom/prometheus:latest `
  --config.file=/etc/prometheus/prometheus.yml `
  --storage.tsdb.path=/prometheus `
  --web.console.libraries=/usr/share/prometheus/console_libraries `
  --web.console.templates=/usr/share/prometheus/consoles

# Verify Prometheus is running
docker ps | Select-String prometheus-integration

# Check Prometheus logs
docker logs prometheus-integration

# Access Prometheus UI
# Open browser: http://localhost:9091
```

### Verify Prometheus Configuration

1. **Check Targets:**
   - Open: http://localhost:9091/targets
   - Verify: `discord-security-bot` target shows **UP** status
   - Expected: `host.docker.internal:9090` reachable

2. **Query Metrics:**
   - Open: http://localhost:9091/graph
   - Run query: `security_bot_role_assignments_total`
   - Expected: Metrics visible with labels (origin, guild_id, result)

3. **Troubleshooting:**
   - **Target DOWN:** Ensure Discord bot running on port 9090
   - **Connection refused:** Check `host.docker.internal` resolves (Windows Docker Desktop)
   - **No metrics:** Verify bot metrics server started (check bot logs)

## Step 2: Start Discord Bot with Metrics

```powershell
# In repository root
npm run dev

# Expected output:
# [SUCCESS] Prometheus metrics server started
# Port: 9090
# URL: http://0.0.0.0:9090/metrics
# Endpoints: /metrics, /health, /
```

## Step 3: Verify Metrics Endpoint

```powershell
# Test metrics endpoint directly
curl http://localhost:9090/metrics

# Expected output (sample):
# HELP security_bot_role_assignments_total Total role assignments
# TYPE security_bot_role_assignments_total counter
# security_bot_role_assignments_total{origin="security-bot-sweep",guild_id="123",result="success"} 42

# Test health endpoint
curl http://localhost:9090/health

# Expected output:
# {"status":"ok","timestamp":"2025-12-01T...Z","uptime":123.45}
```

## Step 4: Optional - Start Grafana

```powershell
# Start Grafana container
docker run -d `
  --name grafana-integration `
  -p 3000:3000 `
  grafana/grafana:latest

# Access Grafana UI
# Open browser: http://localhost:3000
# Default credentials: admin / admin (change on first login)
```

### Add Prometheus Data Source in Grafana

1. Go to: **Configuration** → **Data Sources**
2. Click: **Add data source**
3. Select: **Prometheus**
4. Configure:
   - **URL:** `http://host.docker.internal:9091` (Windows Docker Desktop)
   - **URL:** `http://172.17.0.1:9091` (Linux Docker)
   - **Access:** Server (default)
5. Click: **Save & Test**
6. Expected: "Data source is working" (green checkmark)

## Step 5: Create First Integration Test

```powershell
# Create integration test file
New-Item -Path tests/integration/prometheus-e2e.spec.js -ItemType File

# Run integration tests
npm test -- tests/integration/prometheus-e2e.spec.js
```

## Cleanup

```powershell
# Stop and remove Prometheus container
docker stop prometheus-integration
docker rm prometheus-integration

# Stop and remove Grafana container (if started)
docker stop grafana-integration
docker rm grafana-integration

# Verify cleanup
docker ps -a | Select-String integration
```

## Troubleshooting

### Issue: "connection refused" from Prometheus
**Solution:** Ensure Discord bot is running and metrics server started on port 9090.

```powershell
# Check if bot is running
Get-Process | Select-String node

# Check if port 9090 is listening
netstat -ano | Select-String :9090
```

### Issue: "no such host" for host.docker.internal
**Solution:** Use Docker Desktop on Windows, or use `172.17.0.1` on Linux.

```powershell
# Test connectivity from inside Prometheus container
docker exec prometheus-integration ping host.docker.internal
```

### Issue: Metrics not updating in Prometheus
**Solution:** Check scrape interval (15s default) and verify bot is recording metrics.

```promql
# Query last scrape time in Prometheus
up{job="discord-security-bot"}

# Query metric with timestamp
security_bot_role_assignments_total[5m]
```

## Next Steps

1. ✅ Prometheus infrastructure setup - **THIS GUIDE**
2. 🔄 Create integration tests (`prometheus-e2e.spec.js`)
3. 🔄 Verify all 11 metric types populate correctly
4. 🔄 Create Grafana dashboards (5 total)
5. 🔄 Set up AlertManager rules (4+ rules)

---

**Week 4 Day 22 Status:** Infrastructure setup in progress  
**Team Lead:** QA/DevOps Engineer  
**Last Updated:** 2025-11-30
