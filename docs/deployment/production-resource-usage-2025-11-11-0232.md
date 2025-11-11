# Infinity Gauntlet - Production Resource Usage Report
Generated: 2025-11-11 02:32:25 UTC
Service: Infinity-Gauntlet (srv-d3snk2ndiees73cn709g)
Region: Virginia

## Service Configuration
- Plan: Starter
- Instances: 1
- Persistent Disk: 1 GB (mounted at /Store)

## Current Deployment
- Deploy ID: dep-d49eag15pdvs73cs6a8g
- Status: live
- Created: 2025-11-11 07:26:57
- Uptime: ~3.5 minutes

## Memory Usage
Total: 61 GiB
Used: 21 GiB (34%)
Free: 3.1 GiB (5%)
Buff/Cache: 37 GiB (61%)
Available: 40 GiB (66%)

## Main Node Process
PID: 74
Memory (RSS): 154 MB (0.2% of total)
Virtual Size: 65 GB (includes mapped libraries)
CPU: 1.7%
Uptime: 3 minutes 25 seconds
Command: node --require tsx src/index.ts

## Disk Usage
Root Filesystem: 290 GB total, 239 GB used (83%), 51 GB available
/Store (Persistent): 974 MB total, 3.5 MB used (0.4%), 954 MB available

## Store Directory Breakdown
Total: 88 KB
- ai-logs: 16 KB
- discord-cache: 12 KB
- logs: 28 KB
- onpremise-dev-primary: 16 KB
- runtime-cache: 12 KB

## AI Logging System
Active Log File: general-2025-11-11T07-28-53.ndjson
Size: 4.1 KB
Entries: 5 log entries
Compressed Logs: 0 (none created yet, compression starts after 1 hour)

## Resource Health
✅ Memory: Healthy (66% available, 154 MB used by app)
✅ Disk: Healthy (51 GB available on root, 954 MB on /Store)
✅ CPU: Normal (1.7% usage)
✅ Process: Stable (running 3+ minutes without issues)

## Notes
- Main application using minimal resources (154 MB RAM)
- Persistent disk usage very low (3.5 MB / 974 MB = 0.4%)
- AI logging active with 5 entries since deployment
- No compressed logs yet (expected, only 3 minutes uptime)
