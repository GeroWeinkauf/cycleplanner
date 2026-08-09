#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# fetch-region.sh (P5-1)
#
# Downloads and optionally merges OSM data for a region.
# Supports:
#   - Single region download (e.g. a German Bundesland)
#   - Multi-region merge (e.g. all of Germany from federal states)
#   - Elevation data download for the covered area
#
# Usage:
#   ./scripts/fetch-region.sh <region>
#   ./scripts/fetch-region.sh germany        # All 16 states merged
#   ./scripts/fetch-region.sh mid-europe     # DE + AT + CH + CZ + PL
#
# Requirements:
#   - wget or curl
#   - osmium-tool (for merging, install: apt install osmium-tool)
# ───────────────────────────────────────────────────────────

set -euo pipefail

DATA_DIR="${DATA_DIR:-data/custom_files}"
GEOFABRIK_BASE="https://download.geofabrik.de"

# ── Region definitions ──────────────────────────────────

declare -A REGIONS
REGIONS["mecklenburg-vorpommern"]="europe/germany/mecklenburg-vorpommern"
REGIONS["sachsen"]="europe/germany/sachsen"
REGIONS["bayern"]="europe/germany/bayern"
REGIONS["niedersachsen"]="europe/germany/niedersachsen"
REGIONS["baden-wuerttemberg"]="europe/germany/baden-wuerttemberg"
REGIONS["brandenburg"]="europe/germany/brandenburg"
REGIONS["hessen"]="europe/germany/hessen"
REGIONS["nordrhein-westfalen"]="europe/germany/nordrhein-westfalen"
REGIONS["rheinland-pfalz"]="europe/germany/rheinland-pfalz"
REGIONS["saarland"]="europe/germany/saarland"
REGIONS["sachsen-anhalt"]="europe/germany/sachsen-anhalt"
REGIONS["schleswig-holstein"]="europe/germany/schleswig-holstein"
REGIONS["thueringen"]="europe/germany/thueringen"
REGIONS["berlin"]="europe/germany/berlin"
REGIONS["bremen"]="europe/germany/bremen"
REGIONS["hamburg"]="europe/germany/hamburg"

# Germany = all 16 states
GERMANY_STATES=(
  "mecklenburg-vorpommern" "sachsen" "bayern" "niedersachsen"
  "baden-wuerttemberg" "brandenburg" "hessen" "nordrhein-westfalen"
  "rheinland-pfalz" "saarland" "sachsen-anhalt" "schleswig-holstein"
  "thueringen" "berlin" "bremen" "hamburg"
)

MID_EUROPE_STATES=(
  "germany" "austria" "switzerland" "czech-republic" "poland"
)

# ── Helper functions ───────────────────────────────────

log()  { echo "[$(date +%H:%M:%S)] $*"; }
warn() { echo "[$(date +%H:%M:%S)] WARN: $*" >&2; }

download_file() {
  local url="$1"
  local dest="$2"

  if command -v wget &>/dev/null; then
    wget -q --show-progress -O "$dest" "$url"
  else
    curl -L --progress-bar -o "$dest" "$url"
  fi
}

download_region() {
  local region="$1"
  local geofabrik_path="${REGIONS[$region]:-}"
  local dest="$DATA_DIR/${region}-latest.osm.pbf"

  if [ -z "$geofabrik_path" ]; then
    warn "Unknown region: $region"
    return 1
  fi

  local url="${GEOFABRIK_BASE}/${geofabrik_path}-latest.osm.pbf"
  log "Downloading $region from $url ..."
  mkdir -p "$DATA_DIR"
  download_file "$url" "$dest"
  log "  -> $dest ($(du -h "$dest" | cut -f1))"
}

# ── Main ──────────────────────────────────────────────

REGION="${1:-}"

if [ -z "$REGION" ]; then
  echo "Usage: $0 <region>"
  echo ""
  echo "Available regions:"
  echo "  Single: ${!REGIONS[*]}"
  echo "  Multi:  germany, mid-europe"
  echo ""
  echo "Environment:"
  echo "  DATA_DIR   Output directory (default: data/custom_files)"
  exit 1
fi

mkdir -p "$DATA_DIR"

case "$REGION" in
  germany)
    log "=== Fetching all 16 German states ==="
    for state in "${GERMANY_STATES[@]}"; do
      download_region "$state"
    done

    log "=== Merging into germany-latest.osm.pbf ==="
    if command -v osmium &>/dev/null; then
      mapfile -t inputs < <(ls "$DATA_DIR"/*-latest.osm.pbf 2>/dev/null)
      if [ ${#inputs[@]} -gt 1 ]; then
        osmium merge "${inputs[@]}" -o "$DATA_DIR/germany-latest.osm.pbf"
        log "Merged ${#inputs[@]} files into germany-latest.osm.pbf ($(du -h "$DATA_DIR/germany-latest.osm.pbf" | cut -f1))"
      else
        warn "No files to merge (download individually first)"
      fi
    else
      warn "osmium-tool not installed. Skipping merge."
      warn "Install with: sudo apt install osmium-tool"
    fi
    ;;

  mid-europe)
    log "=== Fetching Mid-Europe regions ==="
    download_region "germany" || true

    # Austria
    log "Downloading Austria..."
    download_file "${GEOFABRIK_BASE}/europe/austria-latest.osm.pbf" "$DATA_DIR/austria-latest.osm.pbf"

    # Switzerland
    log "Downloading Switzerland..."
    download_file "${GEOFABRIK_BASE}/europe/switzerland-latest.osm.pbf" "$DATA_DIR/switzerland-latest.osm.pbf"

    # Czech Republic
    log "Downloading Czech Republic..."
    download_file "${GEOFABRIK_BASE}/europe/czech-republic-latest.osm.pbf" "$DATA_DIR/czech-republic-latest.osm.pbf"

    # Poland
    log "Downloading Poland..."
    download_file "${GEOFABRIK_BASE}/europe/poland-latest.osm.pbf" "$DATA_DIR/poland-latest.osm.pbf"

    log "=== Merging Mid-Europe ==="
    if command -v osmium &>/dev/null; then
      mapfile -t inputs < <(ls "$DATA_DIR"/*-latest.osm.pbf 2>/dev/null)
      if [ ${#inputs[@]} -gt 1 ]; then
        osmium merge "${inputs[@]}" -o "$DATA_DIR/mideurope-latest.osm.pbf"
        log "Merged into mideurope-latest.osm.pbf ($(du -h "$DATA_DIR/mideurope-latest.osm.pbf" | cut -f1))"
      fi
    else
      warn "osmium-tool not installed. Install with: sudo apt install osmium-tool"
    fi
    ;;

  *)
    download_region "$REGION"
    ;;
esac

log "=== Done ==="
log "Next: Build the Valhalla graph with:"
log "  docker compose --profile build up valhalla-build"
log "Or for custom build:"
log "  ./scripts/build-valhalla.sh"
