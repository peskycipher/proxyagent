#!/usr/bin/env bash
# Model provisioning — downloads GGUF weights once, then caches across
# container recreations (vast keeps the volume, docker layers are rebuilt).
#
# Matches the production layout observed on instance 54026402:
#   /workspace/models/<alias>.gguf          main weights
#   /workspace/models/<alias>.mmproj.gguf   vision clip projection (optional)
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-/workspace/models}"
GGUF_URL="${GGUF_URL:-https://huggingface.co/mradermacher/Qwen3.8-27B-Uncensored-Mythos-Class-Agentic-GGUF/resolve/main/Qwen3.8-27B-Uncensored-Mythos-Class-Agentic.Q4_K_M.gguf}"
GGUF_FILE="${GGUF_FILE:-$(basename "${GGUF_URL%%\?*}")}"
MMPROJ_URL="${MMPROJ_URL:-https://huggingface.co/mradermacher/Qwen3.8-27B-Uncensored-Mythos-Class-Agentic-GGUF/resolve/main/Qwen3.8-27B-Uncensored-Mythos-Class-Agentic.mmproj-f16.gguf}"
MMPROJ_FILE="${MMPROJ_FILE:-$(basename "${MMPROJ_URL%%\?*}")}"

mkdir -p "$MODELS_DIR"

download() { # url dest label
  local url="$1" dest="$2" label="$3"
  if [ -s "$dest" ]; then
    echo "[provisioning] $(basename "$dest") already cached — skipping download"
    return 0
  fi
  echo "[provisioning] downloading $label"
  curl -L --fail --retry 3 --retry-delay 5 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
  echo "[provisioning] done: $dest ($(du -h "$dest" | cut -f1))"
}

download "$GGUF_URL"    "$MODELS_DIR/$GGUF_FILE"    "main weights"
download "$MMPROJ_URL"  "$MODELS_DIR/$MMPROJ_FILE"  "mmproj (vision)"

echo "$MODELS_DIR/$GGUF_FILE" > /tmp/llama-model-path
[ -s "$MODELS_DIR/$MMPROJ_FILE" ] && echo "$MODELS_DIR/$MMPROJ_FILE" > /tmp/llama-mmproj-path