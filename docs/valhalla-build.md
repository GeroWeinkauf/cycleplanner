# Valhalla Configuration Guide (P5-2)

## Overview

This document explains each setting in `config/valhalla.json` and
which ones require a Valhalla restart or graph rebuild.

## Tuning Levels

| Level | Scope | Restart? | Rebuild? |
|---|---|---|---|
| 1 — Runtime params | Per-request costing options (`use_hills`, `avoid_bad_surfaces`, etc.) | No | No |
| 2 — Service config | `service_limits`, `hierarchy_limits` | **Yes** | No |
| 3 — Candidate re-ranking | Own scoring logic in backend | No | No |
| 4 — Cost function | C++ source changes (`bicyclecost.cc`) | **Yes** | **Yes** |

## Key Configuration Settings

### service_limits (Level 2, restart required)

| Setting | Default | Effect |
|---|---|---|
| `bicycle.max_distance` | 500000 (500 km) | Maximum route distance in meters |
| `bicycle.max_alternates` | 5 | Number of alternative routes returned |
| `allow_hard_exclusions` | true | Enables `exclude_ferries`, `exclude_unpaved`, etc. |
| `max_exclude_polygons_length` | 10000 | Max vertices in exclusion polygons |
| `max_distance_disable_hierarchy_culling` | 0 | 0 = disabled; set to enable full-graph search |

### hierarchy_limits (Level 2, restart required)

Controls how the routing graph hierarchy transitions between levels:

| Level | Road classes included |
|---|---|
| 0 | All roads (local streets, paths) |
| 1 | Arterial roads (secondary, primary) |
| 2 | Highways only (trunk, motorway) |

`max_up_transitions` limits how many times the search moves to a higher level.
`expand_within_distance` limits how far the search expands at each level.

### thor (Level 2, restart required)

Routing algorithm parameters:
- `bidirectional_astar.threshold_delta` (420): Convergence threshold for bidirectional A*
- `alternative_cost_extend` (1.2): How much costlier alternatives can be

### loki (Level 2, restart required)

Location service:
- `service_defaults.radius` (0): Search radius for point snapping (0 = auto)
- `service_defaults.search_cutoff` (35000): Max meters to search for a road

### mjolnir (Level 4, graph rebuild required)

Graph building:
- `hierarchy` (true): Enable 3-level hierarchy
- `include_bicycle` (true): Include bicycle-specific edges
- `data_processing.use_admin_db` (true): Use admin boundaries for country crossing

## Custom Cost Function (Level 4)

Our custom `bicyclecost.cc` adds a **popularity factor** that weights
edges based on how often they appear in a tour archive.

To modify:
1. Edit `docker/valhalla-src/src/sif/bicyclecost.cc`
2. Run `./scripts/build-valhalla.sh`
3. Update `docker-compose.yml` to use `cycleplanner/valhalla-custom`
4. Rebuild the graph with `docker compose --profile build up`

## Mid-Europe Build

For a mid-Europe region (~1.5 GB PBF, ~50 GB memory during build):

```bash
# 1. Download data
./scripts/fetch-region.sh mid-europe

# 2. Build graph (takes 2-6 hours depending on hardware)
docker compose --profile build up valhalla-build

# 3. Check logs
docker logs -f $(docker compose ps -q valhalla-build)

# 4. After build completes, delete intermediate data (saves 20+ GB)
rm -f data/custom_files/*-latest.osm.pbf
rm -rf data/custom_files/elevation_data/
```
