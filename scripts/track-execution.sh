#!/bin/bash
# Execution Metadata Tracker — v2.1.2
# Records model/category for each wave/slice execution
# Usage: bash track-execution.sh <plan_name> <wave_number> <slice_name> <model> <category>

PLAN_NAME="${1:-unknown}"
WAVE_NUM="${2:-1}"
SLICE_NAME="${3:-unknown}"
MODEL="${4:-unknown}"
CATEGORY="${5:-unknown}"

META_DIR="${HOME}/.sisyphus/metadata"
mkdir -p "$META_DIR"

META_FILE="${META_DIR}/${PLAN_NAME}-execution.log"
TIMESTAMP=$(date -Iseconds)

echo "${TIMESTAMP} | Wave ${WAVE_NUM} | Slice ${SLICE_NAME} | Model: ${MODEL} | Category: ${CATEGORY}" >> "$META_FILE"

echo "Execution tracked: ${MODEL} via ${CATEGORY}"
