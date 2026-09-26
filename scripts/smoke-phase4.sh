#!/usr/bin/env bash
# Phase 4 smoke test wrapper (transfer + adjustment + move history lifecycle).
set -euo pipefail
node "$(dirname "$0")/smoke-phase4.mjs" "$@"
