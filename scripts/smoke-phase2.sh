#!/usr/bin/env bash
# Phase 2 smoke test wrapper (products, stock, warehouses, locations, dashboard).
set -euo pipefail
node "$(dirname "$0")/smoke-phase2.mjs" "$@"
