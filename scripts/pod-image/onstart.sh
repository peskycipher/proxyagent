#!/usr/bin/env bash
# Container onstart — the vast.ai "docker start" script.
#
# Boot order (root-cause fix for instance-54026402): the sshd StrictModes auth
# window existed because sshd served before authorized_keys was usable —
# 15 refused logins over ~2.5 min (see instance-54026402-instance-logs.txt).
# The guard MUST run before any sshd serves, and provisioning must never run
# before the guard (a failed boot is otherwise unreachable for debugging).
set -euo pipefail

echo "[onstart] boot $(date -u +%FT%TZ)"

# --- 1. SSH: normalize key ownership/modes, validate key material ----------
# Idempotent with vast's own ssh layer; also repairs after a bad-volume boot.
onstart-ssh-guard.sh

# --- 2. Weights: cached across container recreations ------------------------
provision-model.sh
MODEL_PATH="$(cat /tmp/llama-model-path)"
MMPROJ_ARGS=()
if [ -s /tmp/llama-mmproj-path ]; then
  MMPROJ_ARGS=(--mmproj "$(cat /tmp/llama-mmproj-path)")
fi

# --- 3. llama-server ---------------------------------------------------------
SERVE_PORT="${SERVE_PORT:-8080}"
LLAMA_MODEL_ID="${LLAMA_MODEL_ID:-Qwen3.8 27B Uncensored Mythos Agentic Q4_K_M}"

# llama.cpp release images ship binaries in /app (server, cli…); source
# builds land in /opt/llama.cpp/build/bin. Prefer whichever exists.
LLAMA_BIN="${LLAMA_BIN:-}"
if [ -z "$LLAMA_BIN" ]; then
  for c in /app/llama-server /opt/llama.cpp/build/bin/llama-server; do
    [ -x "$c" ] && LLAMA_BIN="$c" && break
  done
fi
if command -v llama-server >/dev/null 2>&1; then
  LLAMA_BIN="${LLAMA_BIN:-llama-server}"
fi
[ -n "$LLAMA_BIN" ] || { echo "[onstart] FATAL: llama-server binary not found"; exit 1; }

server_args=(
  -m "$MODEL_PATH"
  --alias "$LLAMA_MODEL_ID"
  --host 0.0.0.0
  --port "$SERVE_PORT"
  -ngl 99
  "${MMPROJ_ARGS[@]}"
)
[ -n "${LLAMA_API_KEY:-}" ] && server_args+=(--api-key "$LLAMA_API_KEY")

echo "[onstart] launching llama-server on :$SERVE_PORT (model: $(basename "$MODEL_PATH"))"
"$LLAMA_BIN" "${server_args[@]}" &
LLAMA_PID=$!

# --- 4. Cloudflare tunnel (only when configured) -----------------------------
if [ -n "${TUNNEL_TOKEN:-}" ]; then
  echo "[onstart] starting cloudflared tunnel"
  cloudflared tunnel run --token "$TUNNEL_TOKEN" &
else
  echo "[onstart] TUNNEL_TOKEN unset — serving on the instance's direct port only"
fi

# --- 5. Supervise ------------------------------------------------------------
cleanup() {
  echo "[onstart] shutting down"
  kill "$LLAMA_PID" 2>/dev/null || true
}
trap cleanup TERM INT
wait "$LLAMA_PID"