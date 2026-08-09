#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# build-valhalla.sh (P5-2)
#
# Builds a custom Valhalla Docker image with modified
# bicycle cost function. Uses the Dockerfile in docker/.
#
# The custom image adds a "popularity" factor to the
# bicycle costing that can weight edges based on how
# frequently they appear in a tour archive.
#
# Usage:
#   ./scripts/build-valhalla.sh              # Build custom image
#   ./scripts/build-valhalla.sh --clean      # Force clean rebuild
#   ./scripts/build-valhalla.sh --tag v1.0   # Tag with version
# ───────────────────────────────────────────────────────────

set -euo pipefail

CLEAN=false
TAG="latest"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean) CLEAN=true; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[$(date +%H:%M:%S)] $*"; }

log "=== Building custom Valhalla image ==="

# Ensure we have the Valhalla source
VALHALLA_SRC_DIR="docker/valhalla-src"
if [ ! -d "$VALHALLA_SRC_DIR" ]; then
  log "Cloning Valhalla source (this is done once)..."
  git clone --depth 1 --branch 3.5.0 \
    https://github.com/valhalla/valhalla.git \
    "$VALHALLA_SRC_DIR"
fi

# Apply our custom cost function patches
PATCH_DIR="docker/patches"
if [ -d "$PATCH_DIR" ] && [ "$(ls -A "$PATCH_DIR" 2>/dev/null)" ]; then
  log "Applying patches..."
  for patch in "$PATCH_DIR"/*.patch; do
    log "  Applying $(basename "$patch")..."
    (cd "$VALHALLA_SRC_DIR" && git apply --check "$OLDPWD/$patch" 2>/dev/null && \
     git apply "$OLDPWD/$patch") || \
      warn "Patch $(basename "$patch") already applied or failed"
  done
fi

# Build the Docker image
IMAGE_NAME="cycleplanner/valhalla-custom:${TAG}"

if [ "$CLEAN" = true ]; then
  log "Clean rebuild requested"
  docker build --no-cache -t "$IMAGE_NAME" \
    -f docker/Dockerfile.valhalla-custom \
    docker/
else
  docker build -t "$IMAGE_NAME" \
    -f docker/Dockerfile.valhalla-custom \
    docker/
fi

log "=== Done ==="
log "Custom Valhalla image built: $IMAGE_NAME"
log ""
log "To use this image, update docker-compose.yml:"
log "  valhalla:"
log "    image: cycleplanner/valhalla-custom:${TAG}"
log ""
log "Then rebuild the graph with:"
log "  docker compose --profile build up valhalla-build"
