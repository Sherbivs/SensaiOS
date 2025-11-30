# VS Code Docker Integration Guide

## Overview

This guide explains how to use VS Code tasks and launch configurations to work with the Docker containerized Pokémon Infinity Gauntlet application.

## Quick Access

### Command Palette
Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and type:
- **"Tasks: Run Task"** → See all Docker tasks
- **"Docker: Start All Services"** → Quick start

### Task Menu
Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac) to access the build task menu.

## Available Tasks

### Starting/Stopping

#### Docker: Start All Services
**Shortcut**: `Ctrl+Shift+B` → Select "Docker: Start All Services"
- Starts all containers (database + bot + workers)
- Default build task
- Output shown in integrated terminal

```bash
# Equivalent command:
docker-compose up -d
```

#### Docker: Stop All Services
- Stops all running containers
- Preserves data in volumes

```bash
# Equivalent command:
docker-compose down
```

#### Docker: Rebuild and Restart
- Rebuilds images from source
- Restarts all containers
- Use after code changes

```bash
# Equivalent command:
docker-compose up -d --build
```

### Monitoring

#### Docker: View Bot Logs
- Shows real-time logs from main bot
- Follows log output (like `tail -f`)
- Press `Ctrl+C` to stop

```bash
# Equivalent command:
docker-compose logs -f bot
```

#### Docker: View All Logs
- Shows logs from all services
- Useful for debugging interactions
- Color-coded by service

```bash
# Equivalent command:
docker-compose logs -f
```

#### Docker: Show Service Status
- Lists all containers and their status
- Shows health check status
- Shows ports and uptime

```bash
# Equivalent command:
docker-compose ps
```

#### Docker: Check Health
- Tests the health endpoint
- Returns bot status JSON
- Quick way to verify bot is running

```bash
# Equivalent command:
curl -f http://localhost:3000/health
```

### Database Operations

#### Docker: Run Migrations
- Applies Prisma migrations to database
- Required after pulling schema changes
- Safe to run multiple times

```bash
# Equivalent command:
docker-compose exec bot npx prisma migrate deploy
```

#### Docker: Connect to PostgreSQL
- Opens interactive psql shell
- Full SQL access to database
- Type `\q` to exit

```bash
# Equivalent command:
docker-compose exec postgres psql -U gauntlet -d infinity_gauntlet
```

Common psql commands:
```sql
\dt               -- List tables
\d+ "User"        -- Describe table
SELECT COUNT(*) FROM "User";
\q                -- Quit
```

### Development

#### Docker: Open Bot Shell
- Opens shell inside bot container
- Full access to Node.js, npm, etc.
- Type `exit` to close

```bash
# Equivalent command:
docker-compose exec bot sh
```

Inside container you can:
```bash
node -v           # Check Node version
npm test          # Run tests
ls -la /app       # Browse files
```

### Maintenance

#### Docker: Clean All (Remove Volumes)
- **WARNING**: Deletes all data!
- Removes containers AND volumes
- Fresh slate for testing

```bash
# Equivalent command:
docker-compose down -v
```

## Task Workflow Examples

### First Time Setup

1. **Configure Environment**
   ```powershell
   Copy-Item .env.docker .env
   # Edit .env with your bot tokens
   ```

2. **Start Services**
   - Press `Ctrl+Shift+B`
   - Select "Docker: Start All Services"
   - Wait ~30 seconds

3. **Run Migrations**
   - `Ctrl+Shift+P` → "Tasks: Run Task"
   - Select "Docker: Run Migrations"

4. **View Logs**
   - `Ctrl+Shift+P` → "Tasks: Run Task"
   - Select "Docker: View Bot Logs"

5. **Verify Health**
   - `Ctrl+Shift+P` → "Tasks: Run Task"
   - Select "Docker: Check Health"

### Daily Development

1. **Start work**
   - `Ctrl+Shift+B` → "Docker: Start All Services"

2. **Make code changes**
   - Edit files in VS Code
   - Save changes

3. **Rebuild and test**
   - `Ctrl+Shift+P` → "Tasks: Run Task"
   - Select "Docker: Rebuild and Restart"
   - Wait for rebuild
   - Check "Docker: View Bot Logs"

4. **End work**
   - `Ctrl+Shift+P` → "Tasks: Run Task"
   - Select "Docker: Stop All Services"

### Debugging Database Issues

1. **Check service status**
   - Run "Docker: Show Service Status"
   - Verify postgres is healthy

2. **Connect to database**
   - Run "Docker: Connect to PostgreSQL"
   - Inspect tables, run queries

3. **Check logs**
   - Run "Docker: View All Logs"
   - Look for database errors

4. **Reset if needed**
   - Run "Docker: Clean All (Remove Volumes)"
   - Run "Docker: Start All Services"
   - Run "Docker: Run Migrations"

## Launch Configurations

### Docker: Attach to Bot (Debug Mode)

**Note**: Requires starting container with debug port exposed.

To enable debugging:

1. Add to `docker-compose.yml` bot service:
   ```yaml
   command: ["node", "--inspect=0.0.0.0:9229", "dist/index.js"]
   ports:
     - "3000:3000"
     - "9229:9229"  # Debug port
   ```

2. Rebuild: `docker-compose up -d --build bot`

3. In VS Code:
   - Press `F5` or go to Run and Debug panel
   - Select "Docker: Attach to Bot"
   - Set breakpoints in TypeScript files

### Local: Start Bot (Dev)

Run bot directly on your machine (without Docker):

1. Ensure `.env` is configured
2. Press `F5`
3. Select "Local: Start Bot (Dev)"

This runs the bot using your local Node.js installation and local environment.

## Keyboard Shortcuts Reference

| Action | Shortcut | Description |
|--------|----------|-------------|
| Run Task | `Ctrl+Shift+P` → "Tasks: Run Task" | Open task picker |
| Build Task | `Ctrl+Shift+B` | Run default build task |
| Debug | `F5` | Start debugging |
| Terminal | `Ctrl+`` | Toggle integrated terminal |
| Command Palette | `Ctrl+Shift+P` | All commands |

## Status Bar Integration

The Docker extension adds status bar items:

- **Docker icon** — Click to see running containers
- **Container count** — Shows active containers
- **Right-click container** → View logs, attach shell, stop

## Docker Extension Features

Install the official Docker extension for enhanced features:

**Extension ID**: `ms-azuretools.vscode-docker`

Features:
- Visual container management
- Image explorer
- Right-click operations
- Dockerfile linting
- docker-compose.yml IntelliSense

Install:
```
Ctrl+Shift+X → Search "Docker" → Install
```

## Tips & Tricks

### Quick Log Access
Add this to your VS Code settings:
```json
{
  "terminal.integrated.defaultProfile.windows": "PowerShell",
  "terminal.integrated.cwd": "${workspaceFolder}"
}
```

### Auto-Save Before Build
```json
{
  "files.autoSave": "onFocusChange"
}
```

### Multi-Terminal Layout
1. Open terminal: `Ctrl+``
2. Split terminal: Click `+` dropdown → "Split Terminal"
3. Run different logs in each pane:
   - Terminal 1: Bot logs
   - Terminal 2: All logs
   - Terminal 3: Commands

### Task Keybindings

Add custom shortcuts in `keybindings.json`:
```json
[
  {
    "key": "ctrl+shift+d ctrl+shift+s",
    "command": "workbench.action.tasks.runTask",
    "args": "Docker: Start All Services"
  },
  {
    "key": "ctrl+shift+d ctrl+shift+l",
    "command": "workbench.action.tasks.runTask",
    "args": "Docker: View Bot Logs"
  }
]
```

## Troubleshooting

### Task Not Found
- Check `.vscode/tasks.json` exists
- Reload window: `Ctrl+Shift+P` → "Reload Window"

### Docker Not Found
- Ensure Docker Desktop is running
- Check PATH includes Docker: `docker --version` in terminal

### Permission Denied
- On Windows: Run VS Code as Administrator
- On Linux: Add user to docker group: `sudo usermod -aG docker $USER`

### Container Won't Start
- Check logs: Run "Docker: View All Logs"
- Check status: Run "Docker: Show Service Status"
- Clean restart: Run "Docker: Clean All" then "Docker: Start All Services"

## VS Code Settings

Recommended workspace settings (`.vscode/settings.json`):

```json
{
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/Store": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Integration with Other Tools

### GitHub Copilot
- Works seamlessly with Docker tasks
- Can suggest docker-compose configurations
- Helps write Dockerfile optimizations

### Remote - Containers
- Use `ms-vscode-remote.remote-containers` extension
- Develop inside running container
- Full IntelliSense inside container

### Thunder Client / REST Client
- Test health endpoint: `http://localhost:3000/health`
- Create `.http` files with requests
- Extension: `rangav.vscode-thunder-client`

## Next Steps

1. **Install Docker Extension**: `Ctrl+Shift+X` → Search "Docker"
2. **Try Running Tasks**: `Ctrl+Shift+B` → Start services
3. **Explore Logs**: Use log tasks to monitor
4. **Setup Debugging**: Configure debug port if needed
5. **Customize**: Add your own tasks to `tasks.json`

## Resources

- **VS Code Tasks**: https://code.visualstudio.com/docs/editor/tasks
- **Docker Extension**: https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker
- **Launch Config**: https://code.visualstudio.com/docs/editor/debugging
- **Project Docs**: `../DOCKER-SETUP.md`, `../DOCKER-QUICKSTART.md`

---

**Last Updated**: 2025-11-30
**VS Code Version**: 1.85+
