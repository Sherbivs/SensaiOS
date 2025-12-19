# ==========================================
# Pokémon Infinity Gauntlet - Docker Container
# ==========================================
# Multi-stage build for Node.js Discord bot application
# Architecture: Discord.js bot + PostgreSQL + Workers
#
# SECURITY: Updated 2025-12-03
# - Base image: node:22-alpine (latest LTS with security patches)
# - npm overrides: cross-spawn@7.0.6, glob@11.0.3, brace-expansion@2.0.2
# - Alpine packages updated via apk upgrade
# - CVE-2024-21538, CVE-2025-64756, CVE-2025-5889 mitigated

# Stage 1: Build Stage
FROM node:22-alpine AS builder

# Update Alpine packages for security patches (busybox CVEs)
RUN apk update && apk upgrade --no-cache

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (Prisma, better-sqlite3, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client \
    bash

# Copy ALL source files first (needed for postinstall build)
COPY . .

# Provide dummy DATABASE_URL for Prisma generate during build
# (Prisma only needs URL format for code generation, not actual connection)
ENV PROD_DATABASE_URL=postgresql://build:build@localhost:5432/build

# Install dependencies (including dev dependencies for build)
# Postinstall will generate Prisma client and build TypeScript
RUN npm ci --include=dev

# Verify build output
RUN test -f dist/index.js || (echo "ERROR: Build failed - dist/index.js not found" && exit 1)

# Stage 2: Production Stage
FROM node:22-alpine

# Update Alpine packages for security patches
RUN apk update && apk upgrade --no-cache

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    bash \
    curl

# Create app user and directories
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies (skip postinstall - we'll copy built files from builder)
RUN npm ci --omit=dev --ignore-scripts

# Copy Prisma schema and generate client
COPY prisma ./prisma/
COPY prisma.config.ts ./
# Provide dummy DATABASE_URL for Prisma generate (not used for connection)
RUN PROD_DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy npx prisma generate

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/assets ./assets
COPY --from=builder --chown=nodejs:nodejs /app/data ./data
COPY --chown=nodejs:nodejs scripts ./scripts
COPY --chown=nodejs:nodejs security-bot.ts ./

# Create Store directory for persistent data
RUN mkdir -p /app/Store && chown -R nodejs:nodejs /app/Store

# Switch to non-root user
USER nodejs

# Expose health check port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Default environment variables (override in docker-compose.yml)
ENV NODE_ENV=production \
    TZ=America/New_York \
    LOG_FORMAT=cli \
    SERVICE_NAME=discord-bot \
    HEALTH_CHECK_PORT=3000 \
    HEALTH_CHECK_HOST=0.0.0.0

# Start command (override for different workers)
CMD ["node", "dist/index.js"]
