#!/usr/bin/env bash
# Phase 1 auth smoke test wrapper (08_PHASE_PLAN.md Phase 1 §13).
# Requires a running stack; see scripts/smoke-auth.mjs for details.
set -euo pipefail
node "$(dirname "$0")/smoke-auth.mjs" "$@"
