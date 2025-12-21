# ROUTER.md — Docker Domain

**Title:** Docker Management CLI  
**Purpose:** TypeScript CLI for Docker container management, building, and compose operations  
**Owned Globs:** `scripts/docker/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

---

## Overview

The docker domain provides a unified CLI for managing Docker containers, images, and compose services. It wraps common Docker operations with consistent output formatting and error handling.

## Files

| File | Purpose | Lines | Commands |
|------|---------|-------|----------|
| `cli.ts` | Docker CLI entry point | ~480 | build, run, logs, ps, images, stop, rm, compose, clean, status |
| `ROUTER.md` | This documentation | ~130 | — |

## Commands

### `build` — Build Docker Image
Builds the project Docker image from Dockerfile.

```bash
npx tsx scripts/docker/cli.ts build
npx tsx scripts/docker/cli.ts build --tag v1.0.0
npx tsx scripts/docker/cli.ts build --no-cache
npx tsx scripts/docker/cli.ts build --platform linux/amd64
```

**Flags:**
- `--tag, -t` — Image tag (default: latest)
- `--no-cache` — Build without cache
- `--platform` — Target platform (e.g., linux/amd64)

### `run` — Run Container
Runs a container from the project image.

```bash
npx tsx scripts/docker/cli.ts run
npx tsx scripts/docker/cli.ts run -d                    # Detached
npx tsx scripts/docker/cli.ts run --env-file .env      # With env file
npx tsx scripts/docker/cli.ts run -p 3000:3000         # Port mapping
```

**Flags:**
- `--tag, -t` — Image tag (default: latest)
- `--name, -n` — Container name
- `--detach, -d` — Run in background
- `--rm` — Remove when stopped
- `--env-file, -e` — Environment file path
- `--port, -p` — Port mapping (host:container)

### `logs` — View Logs
Shows container logs.

```bash
npx tsx scripts/docker/cli.ts logs
npx tsx scripts/docker/cli.ts logs my-container
npx tsx scripts/docker/cli.ts logs -f               # Follow
npx tsx scripts/docker/cli.ts logs --tail 100       # Last 100 lines
npx tsx scripts/docker/cli.ts logs --since 1h       # Last hour
```

**Flags:**
- `--follow, -f` — Follow log output
- `--tail, -n` — Number of lines
- `--since` — Show logs since timestamp

### `ps` — List Containers
Lists running containers.

```bash
npx tsx scripts/docker/cli.ts ps
npx tsx scripts/docker/cli.ts ps -a    # Include stopped
```

### `images` — List Images
Lists Docker images.

```bash
npx tsx scripts/docker/cli.ts images
npx tsx scripts/docker/cli.ts images --project   # Project images only
```

### `stop` — Stop Container
Stops a running container.

```bash
npx tsx scripts/docker/cli.ts stop
npx tsx scripts/docker/cli.ts stop my-container
```

### `rm` — Remove Container
Removes a container.

```bash
npx tsx scripts/docker/cli.ts rm my-container
npx tsx scripts/docker/cli.ts rm my-container -f   # Force
```

### `compose` — Docker Compose
Manages Docker Compose services.

```bash
npx tsx scripts/docker/cli.ts compose up
npx tsx scripts/docker/cli.ts compose up -d        # Detached
npx tsx scripts/docker/cli.ts compose down
npx tsx scripts/docker/cli.ts compose logs
npx tsx scripts/docker/cli.ts compose ps
npx tsx scripts/docker/cli.ts compose restart
npx tsx scripts/docker/cli.ts compose up --loki    # Use Loki compose file
```

**Flags:**
- `--file, -f` — Compose file path
- `--loki` — Use docker-compose.loki.yml
- `--detach, -d` — Detached mode for up

### `clean` — Cleanup Resources
Removes unused Docker resources.

```bash
npx tsx scripts/docker/cli.ts clean
npx tsx scripts/docker/cli.ts clean --all          # Everything
npx tsx scripts/docker/cli.ts clean --images       # Dangling images
npx tsx scripts/docker/cli.ts clean --containers   # Stopped containers
npx tsx scripts/docker/cli.ts clean --volumes      # Unused volumes
```

### `status` — System Status
Shows Docker system information.

```bash
npx tsx scripts/docker/cli.ts status
```

**Output includes:**
- Docker version
- Disk usage by type
- Running container count
- Project-specific containers

## Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `PROJECT_NAME` | `infinity-gauntlet` | Default container/image name |
| `DOCKERFILE_PATH` | `Dockerfile` | Project Dockerfile |
| `COMPOSE_FILE` | `docker-compose.yml` | Main compose file |
| `LOKI_COMPOSE_FILE` | `docker-compose.loki.yml` | Loki stack compose |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Docker not running or operation failed |

## Migration Mapping

| Legacy Workflow | New Command |
|----------------|-------------|
| `docker build -t infinity-gauntlet .` | `npx tsx scripts/docker/cli.ts build` |
| `docker-compose up -d` | `npx tsx scripts/docker/cli.ts compose up -d` |
| `docker-compose -f docker-compose.loki.yml up` | `npx tsx scripts/docker/cli.ts compose up --loki` |
| `docker system prune` | `npx tsx scripts/docker/cli.ts clean` |

## Dependencies

- **lib/cli.ts** — CLI framework
- **lib/output.ts** — Formatting utilities
- **lib/exec.ts** — Command execution

## Related Files

- [Dockerfile](../../Dockerfile) — Project Dockerfile
- [docker-compose.yml](../../docker-compose.yml) — Main compose file
- [docker-compose.loki.yml](../../docker-compose.loki.yml) — Loki observability stack
- [scripts/lib/ROUTER.md](../lib/ROUTER.md) — Foundation library
