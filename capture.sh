#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export CAPTURE_START_SELECTOR="${CAPTURE_START_SELECTOR:-#play-button}"
/usr/bin/time -p node "${RUNTIME_DIR:?}/scripts/default-capture.mjs"
