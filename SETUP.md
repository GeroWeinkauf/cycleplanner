# CyclePlanner – Complete Setup Guide

This document describes **everything** needed to replicate this project on a new PC,
starting from **only Visual Studio Code installed**.

---

## Table of Contents

1. [Prerequisites Installation](#prerequisites-installation)
2. [WSL Setup (Windows only)](#wsl-setup-windows-only)
3. [Clone & Initial Setup](#clone--initial-setup)
4. [Download OSM Region Data](#download-osm-region-data)
5. [Build Valhalla Routing Graph](#build-valhalla-routing-graph)
6. [Run the Application](#run-the-application)
7. [Development Workflow](#development-workflow)
8. [Project Structure Reference](#project-structure-reference)
9. [Configuration Reference](#configuration-reference)
10. [Troubleshooting](#troubleshooting)
11. [Backup & Restore](#backup--restore)

---

## Project Overview

**CyclePlanner** is a locally-operated web application for planning bicycle tours
using the Valhalla routing engine with deep configuration of routing parameters
through an interactive map-based UI.

**Tech Stack:**
| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, MapLibre GL JS, Zustand, TanStack Query 5, Tailwind CSS 4 |
| Backend | Node.js 22, Fastify 5, better-sqlite3 |
| Routing Engine | Valhalla (C++, Docker container) |
| Reverse Proxy | Caddy 2 |
| Monorepo | pnpm workspaces |
| Containers | Docker + Docker Compose |
| Language | TypeScript 5, strict |

**Architecture** – 4 Docker Compose services:

1. **Caddy (web)** – serves frontend, proxies `/api` to backend. Only externally exposed.
2. **Backend (api)** – Fastify server. Route calculation, analysis, scoring, POI queries.
3. **Valhalla** – Routing engine. Internal only, never exposed to browser.
4. **Valhalla-build** – One-shot container (profile "build") to build the routing graph.

---

## Prerequisites Installation

On a fresh PC with only **Visual Studio Code** installed, you need:

| Tool | Version | Install Link |
|---|---|---|
| Git | any | https://git-scm.com/downloads |
| Node.js | >= 22 LTS | https://nodejs.org (get LTS) |
| pnpm | >= 10 | `npm install -g pnpm@latest` (after Node.js) |
| Docker Desktop | any | https://www.docker.com/products/docker-desktop/ |
| WSL 2 | (Windows only) | `wsl --install` in PowerShell as Admin |

### Verify Installations

```bash
git --version
node --version     # must be >= v22.x
pnpm --version     # must be >= 10.x
docker --version
docker compose version
wsl --status       # Default Version: 2
```

---

## WSL Setup (Windows only)

**All project work happens inside WSL**, not on Windows filesystem.
Valhalla needs a Linux environment for file permissions and Docker volumes.

```bash
# Open WSL terminal (type "wsl" or "Ubuntu" in Start menu)
mkdir -p ~/projects
cd ~/projects
```

**Docker Desktop WSL Integration:**
1. Open Docker Desktop → Settings → Resources → WSL Integration
2. Enable integration with your WSL distribution (Ubuntu)
3. Apply & Restart

Test: `docker run hello-world`

---

## Clone & Initial Setup

```bash
cd ~/projects
git clone https://github.com/YOUR_USERNAME/cycleplanner.git
cd cycleplanner
pnpm install
cp .env.example .env
```

### Minimal `.env` for local development

```
HOST_BIND=127.0.0.1
CADDY_PORT=8080
API_PORT=3000
VALHALLA_SERVER_THREADS=4
DEPLOY_MODE=local
CADDY_HOSTNAME=localhost
CADDY_TLS=off
```

For AI features (optional):
```
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
LLM_API_KEY=sk-your-key-here
LLM_MODEL=deepseek-chat
```

---

## Download OSM Region Data

The routing engine needs OpenStreetMap data. Default region: **Sachsen, Germany**.

```bash
# Sachsen (~140 MB) – quickest option
./scripts/fetch-region.sh sachsen

# All of Germany (~4 GB) – needs osmium-tool for merging
sudo apt update && sudo apt install -y osmium-tool
./scripts/fetch-region.sh germany

# Mid-Europe: DE + AT + CH + CZ + PL (~6 GB)
sudo apt update && sudo apt install -y osmium-tool
./scripts/fetch-region.sh mid-europe
```

The `.osm.pbf` file goes to `data/custom_files/<region>-latest.osm.pbf`.
If using a different region, update `docker-compose.yml` or `config/valhalla.json`.

---

## Build Valhalla Routing Graph

**Resource Requirements:**
| Region | Download | Build RAM | Build Time |
|---|---|---|---|
| Sachsen | ~140 MB | ~4 GB | ~10 min |
| Germany | ~4 GB | ~16 GB | ~1-2 h |
| Mid-Europe | ~6 GB | ~32 GB | ~4-6 h |

### Build the Graph

```bash
docker compose --profile build up valhalla-build
```

Monitor in another terminal:
```bash
docker compose logs -f valhalla-build
```

This creates the routing graph at:
- `data/custom_files/valhalla_tiles/` – individual tile files
- `data/custom_files/valhalla_tiles.tar` – archive for fast loading

### Cleanup (optional, saves disk space)

```bash
rm -f data/custom_files/*-latest.osm.pbf
```

---

## Run the Application

### Production Mode (all Docker)

```bash
# Build the frontend first
pnpm build

# Start all services
docker compose up -d

# Check status
docker compose ps
curl http://localhost:8080/api/health
```

Open: **http://localhost:8080**

### Development Mode (hot reload)

```bash
# Start Valhalla in background
docker compose up -d valhalla

# Start frontend + backend concurrently
pnpm dev
```

This starts:
- **Frontend:** http://localhost:5173 (Vite dev server, hot reload)
- **Backend:** http://localhost:3000 (tsx watch, auto-restart on changes)
- **Valhalla:** http://localhost:8002 (Docker, always running)

### Stop

```bash
docker compose down          # Stop Docker services
# Ctrl+C in dev terminal      # Stop dev servers
```

---

## Development Workflow

### Commands

```bash
pnpm install          # Install all workspace dependencies
pnpm dev              # Start frontend + backend dev concurrently
pnpm build            # Build all packages (TypeScript -> JS)
pnpm test             # Run all Vitest tests
pnpm lint             # Run ESLint across all packages
pnpm calibrate        # Run calibration tool
```

### Run Individual Packages

```bash
pnpm --filter @cycleplanner/api dev      # Backend only
pnpm --filter @cycleplanner/web dev      # Frontend only
pnpm --filter @cycleplanner/api test     # API tests only
pnpm --filter @cycleplanner/web test     # Web tests only
```

### Git Conventions

- **Branch naming:** `P<phase>-<nr>/<short-description>` (e.g., `P1-2/profiles-panel`)
- **Commit format:** `P<phase>-<nr>: <short description>`
- **Main branch:** `main`

### Phase Overview

| Phase | Description |
|---|---|
| P0 | Foundation: monorepo, Docker Compose, map with layer registry |
| P1 | Core: waypoints, profiles, elevation, round trips, import/export |
| P2 | Tuning: parameter panel, calibration |
| P3 | Analysis: edge attributes, route coloring, quality score, candidates |
| P4 | POI: Overpass integration, corridor queries |
| P5 | Mid-Europe scale, custom Valhalla build |
| P6 | AI tour planning, server deployment |

---

## Project Structure Reference

```
cycleplanner/
├── apps/
│   ├── web/                    Frontend (React, Vite, TypeScript)
│   │   ├── src/
│   │   │   ├── components/     React components (Map, panels, controls)
│   │   │   ├── hooks/          TanStack Query hooks
│   │   │   ├── layers/         MapLibre layer registry
│   │   │   ├── lib/            Utility functions
│   │   │   └── store/          Zustand state stores
│   │   └── index.html
│   │
│   └── api/                    Backend (Fastify, TypeScript)
│       ├── src/
│       │   ├── ai/             AI agent for tour planning (P6-1)
│       │   ├── analysis/       Route analysis, scoring, candidates
│       │   ├── elevation/      Elevation profile from SRTM tiles
│       │   ├── poi/            POI queries via Overpass API
│       │   └── tuning/         Preset management
│       └── Dockerfile
│
├── packages/
│   └── shared/                 Shared TypeScript types
│       └── src/index.ts        Route, Profile, Score, POI types
│
├── config/                     Configuration files
│   ├── Caddyfile               Reverse proxy rules
│   ├── valhalla.json           Valhalla routing engine config
│   ├── profiles.json           Bicycle profiles (Tourenrad, Rennrad, Gravel, MTB)
│   └── score-weights.json      Quality score weights per profile
│
├── calibration/                Reference tours for parameter calibration
├── scripts/                    Utility scripts
│   ├── fetch-region.sh         Download OSM data from Geofabrik
│   ├── build-valhalla.sh       Build custom Valhalla Docker image
│   └── calibrate.ts            Calibration tool
│
├── docker/                     Custom Docker builds
│   └── Dockerfile.valhalla-custom
│
├── docs/                       Additional documentation
│   ├── deployment.md           Deployment guide
│   └── valhalla-build.md       Valhalla configuration reference
│
├── data/                       (gitignored) Runtime data
│   └── custom_files/
│       ├── *.osm.pbf           Raw OpenStreetMap data
│       ├── valhalla_tiles/     Built routing graph tiles
│       ├── valhalla_tiles.tar  Graph archive
│       └── elevation_data/     SRTM elevation tiles (.hgt)
│
├── docker-compose.yml          Container orchestration
├── .env.example                Environment variable template
├── pnpm-workspace.yaml         Monorepo workspace config
├── tsconfig.base.json          Shared TypeScript config
├── eslint.config.js            ESLint configuration
└── package.json                Root package.json
```

---

## Configuration Reference

### profiles.json – Bicycle Profiles

| Profile | bicycle_type | Speed | Surface Strictness | Unpaved |
|---|---|---|---|---|
| Tourenrad | Hybrid | 20 km/h | 60% | Allowed |
| Rennrad | Road | 27 km/h | 95% | Excluded |
| Gravel | Cross | 21 km/h | 15% | Preferred |
| MTB | Mountain | 16 km/h | 5% | Preferred |

### score-weights.json – Quality Score Weights

| Profile | Surface | Bike Infra | Traffic | Stops | Elevation | Amenity |
|---|---|---|---|---|---|---|
| Tourenrad | 0.30 | 0.25 | 0.20 | 0.10 | 0.10 | 0.05 |
| Rennrad | 0.40 | 0.10 | 0.15 | 0.05 | 0.25 | 0.05 |
| Gravel | 0.10 | 0.15 | 0.20 | 0.10 | 0.25 | 0.20 |
| MTB | 0.05 | 0.05 | 0.05 | 0.05 | 0.50 | 0.30 |

### .env Variables

| Variable | Default | Description |
|---|---|---|
| HOST_BIND | 127.0.0.1 | IP to bind ports. Use 0.0.0.0 for LAN/server access |
| CADDY_PORT | 8080 | HTTP port for the web interface |
| CADDY_PORT_HTTPS | 8443 | HTTPS port (server mode only) |
| API_PORT | 3000 | Backend API port (internal) |
| VALHALLA_SERVER_THREADS | 4 | CPU threads for Valhalla |
| DEPLOY_MODE | local | local (no TLS) or server (TLS + auth) |
| CADDY_HOSTNAME | localhost | Domain name for TLS certificate |
| CADDY_TLS | off | off, tls internal, or empty for Let's Encrypt |
| CYCLEPLANNER_CREDENTIALS | (empty) | Basic auth credentials for server mode |
| LLM_API_KEY | (empty) | API key for AI tour planning features |

### valhalla.json – Key Settings

| Section | Setting | Value | Description |
|---|---|---|---|
| service_limits.bicycle | max_distance | 500000 | Max route distance in meters (500 km) |
| service_limits.bicycle | max_alternates | 5 | Number of alternative routes |
| service_limits | allow_hard_exclusions | true | Enables ferry/unpaved/other exclusions |
| mjolnir | tile_dir | /custom_files/valhalla_tiles | Graph tile storage location |
| mjolnir | tile_extract | /custom_files/valhalla_tiles.tar | Graph archive for fast loading |
| additional_data | elevation | /custom_files/elevation_data | Elevation data directory |
| httpd.service | listen | tcp://*:8002 | Valhalla internal port binding |

---

## Troubleshooting

### Valhalla container fails to start

```bash
# Check logs
docker compose logs valhalla

# Common fixes:
# - Missing graph tiles → build them:
docker compose --profile build up valhalla-build

# - Missing OSM data → download first:
./scripts/fetch-region.sh sachsen

# - Port 8002 already in use:
lsof -i :8002 && kill <PID>
```

### pnpm: command not found

```bash
npm install -g pnpm@latest
# If still not found, check npm global bin is in PATH
npm config get prefix
```

### Docker permission denied

```bash
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

### Node.js version too old

```bash
# Using nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22
```

### Frontend cannot reach API (dev mode)

The Vite dev server proxies `/api` to `http://localhost:3000` (check `apps/web/vite.config.ts`).
In Docker/production mode, always access via Caddy at port 8080.

### Container build fails on ARM Mac (M1/M2/M3)

Valhalla image is x86_64 only. Docker Desktop uses Rosetta emulation.
Ensure "Use Rosetta for x86/amd64 emulation" is enabled in Docker Desktop settings.

---

## Backup & Restore

### What to Backup

| Data | Location | Rebuildable? |
|---|---|---|
| Source code | Git repository | N/A – push to GitHub |
| Configuration | .env, config/ | **Backup! Custom settings** |
| Routing graph | data/custom_files/valhalla_tiles/ | Yes (~10 min – 6 h) |
| OSM data | data/custom_files/*.osm.pbf | Yes (re-download) |
| Elevation data | data/custom_files/elevation_data/ | Yes (re-download) |
| SQLite database | data/cycleplanner.db | **Backup! User presets** |

### Quick Backup

```bash
tar -czf cycleplanner-backup-$(date +%Y%m%d).tar.gz \
  .env config/ calibration/ data/cycleplanner.db 2>/dev/null
```

### Full Backup (including graph, large)

```bash
tar -czf cycleplanner-full-backup-$(date +%Y%m%d).tar.gz \
  --exclude='node_modules' --exclude='.pnpm-store' \
  --exclude='.git' --exclude='dist' .
```

### Restore on New Machine

```bash
git clone <repo-url> cycleplanner && cd cycleplanner
tar -xzf cycleplanner-backup-YYYYMMDD.tar.gz
pnpm install
pnpm build
docker compose up -d
```

### Graph Tiles Only

If you backed up the graph files, place them back and skip the build:

```bash
# Restore these directories/files:
#   data/custom_files/valhalla_tiles/
#   data/custom_files/valhalla_tiles.tar
docker compose up -d valhalla
```

---

## Quick Start (TL;DR)

```bash
# 1. Install prerequisites: Git, Node.js >=22, pnpm, Docker Desktop

# 2. Clone and install
git clone <repo-url> cycleplanner && cd cycleplanner
pnpm install
cp .env.example .env

# 3. Download OSM data and build routing graph (Sachsen ~10 min)
./scripts/fetch-region.sh sachsen
docker compose --profile build up valhalla-build

# 4. Build frontend and start
pnpm build
docker compose up -d

# 5. Open http://localhost:8080
```
