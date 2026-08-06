# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CyclePlanner** — a locally-operated web application for planning high-quality bicycle tours. The core is a deeply configurable routing system built on the Valhalla routing engine. This repository contains the concept and implementation planning documents; the actual codebase is built from scratch following the phased plan in the implementation guide.

## Key Documents

- `CyclePlanner_Konzept_v2.0.md` — Complete technical and functional concept (v2.0). The authoritative reference for all design decisions, architecture, data model, routing algorithm tuning, and layer specifications.
- `CyclePlanner_Umsetzungshandbuch_v1.0.md` — Step-by-step implementation guide covering environment setup, project scaffolding, and detailed work packages for each phase (P0–P6) with acceptance criteria.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language (all) | TypeScript 5.x, strict | No `any` without a justifying comment |
| Frontend | React 19, Vite, MapLibre GL JS 5.x, Zustand, TanStack Query 5.x, Tailwind CSS 4, Radix UI | |
| Backend | Node.js 22 LTS, Fastify 5.x, better-sqlite3, Drizzle ORM | |
| Routing engine | Valhalla (C++, Docker container) | Never exposed directly to the browser |
| Reverse proxy | Caddy 2.x | Serves static frontend + proxies `/api` to backend |
| Database | SQLite (file-based, no server) | Backup = file copy. Drizzle ORM enables later Postgres migration |
| Monorepo | pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`) | |
| Tests | Vitest | Mandatory for score logic and utilities |
| Containerization | Docker + Docker Compose | Identical environment local and server |
| Geometry | Turf.js 7.x | Line simplification, buffers, distances |

## Architecture

The application has four local components in a Docker Compose network:

1. **Caddy (web)** — Serves the built frontend as static files, delivers PMTiles with byte-range support, proxies `/api` to the backend. The only container exposed externally.
2. **Backend (Node.js/Fastify)** — The only component that holds API keys. Translates UI requests into routing calls, manages caches, runs analysis/scoring logic. Calls Valhalla internally.
3. **Valhalla (routing)** — Pre-built routing graph for the configured region. Internal-only, never reachable from the browser.
4. **SQLite** — File on a mounted volume, read/written directly by the backend. No separate container.

**Data flow for route calculation:** Browser sends waypoints + profile + tuning params → Backend assembles routing request(s) → Valhalla returns geometry → Backend fetches edge attributes, computes analysis and quality score, selects best candidate → Returns geometry, metrics, and score to browser.

**Architecture invariants:**
- API keys never appear in the frontend bundle
- Routing, analysis, scoring, and tuning work fully offline (only basemap, POIs, and AI mode need network)
- No component holds state outside the SQLite file and filesystem
- Valhalla port is never exposed externally

## Tuning Levels (Routing Algorithm Control)

Four levels of routing algorithm intervention, ordered by effort:

1. **Runtime cost parameters** — Per-request, no restart. Surface type, road class, gradient, bike infrastructure, popularity weightings. Exposed as sliders in the tuning panel.
2. **Service config** — Affects after Valhalla restart, no graph rebuild. Hierarchy limits, alternative routes, service limits.
3. **Candidate re-ranking** — Own scoring logic. Backend generates multiple candidates (engine alternatives + parameter sweep), scores each, selects best. Progressive highway exclusion lives here.
4. **Cost function source changes** — Fork Valhalla, modify bicycle cost function, build custom container image. Last resort.

## Project Structure (post-scaffold)

```
cycleplanner/
├─ apps/
│  ├─ web/          Frontend (React, TypeScript, Vite)
│  └─ api/          Backend (Node, Fastify, TypeScript)
├─ packages/
│  └─ shared/       Shared types: Route, Profile, Analysis, Score
├─ config/          region.yaml, valhalla.json, profiles.json, score-weights.json
├─ calibration/     Reference tours for tuning calibration
├─ scripts/         fetch-region.sh, calibrate.ts
├─ data/            (not versioned) Raw data, graph, database
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

## Working with This Project

This is a **greenfield project** — the codebase is built incrementally from the implementation guide. When implementing:

- **One work package per session.** Each package has a number (e.g., P0-1, P1-2) with specific tasks and acceptance criteria. Do not reach ahead into later packages.
- **Before writing code:** State the plan (files, order). Then implement.
- **After implementing:** Run the acceptance commands listed for that package. Show results. Fix failures before reporting success.
- **Commits:** Format `P<phase>-<nr>: <short description>`.
- **Shared types** go in `packages/shared` — never duplicate across web and api.
- **Configuration** goes in `config/` as files, not as code constants.
- **No browser storage APIs** (localStorage/sessionStorage) for frontend state.
- **Tests:** Every pure computation (quality score, elevation processing, GPX generation) must have a Vitest test with at least one normal case and one edge case.

## Commands (post-scaffold)

```bash
pnpm install          # Install all workspace dependencies
pnpm dev              # Start frontend and backend concurrently
pnpm build            # Build all packages
pnpm test             # Run all Vitest tests
pnpm lint             # Run ESLint across all packages
pnpm calibrate        # Run calibration tool against reference tours
docker compose up -d  # Start all services
docker compose down   # Stop all services
```

## Phase Overview

- **P0** — Foundation: monorepo scaffold, Docker Compose, map with layer registry
- **P1** — Core tour planning: waypoints, profiles, elevation, round trips, import/export, exclusions
- **P2** — Tuning tools: live parameter panel, search space visualization, calibration
- **P3** — Analysis & scoring: edge attributes, route coloring, quality score, candidate re-ranking
- **P4** — POI and enrichment layers
- **P5** — Mid-Europe scale, custom cost function build env, popularity layer, own tile set
- **P6** — AI add-on, optional server deployment
