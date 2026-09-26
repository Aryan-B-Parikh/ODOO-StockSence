#!/usr/bin/env bash
# Phase 3 smoke test wrapper (receipts + deliveries end-to-end).
set -euo pipefail
node "$(dirname "$0")/smoke-phase3.mjs" "$@"
