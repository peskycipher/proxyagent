#!/usr/bin/env bash
# Boot-time SSH guard — root-cause fix for the instance-54026402 window where
# sshd served before authorized_keys was usable:
#   "Authentication refused: bad ownership or modes for file /root/.ssh/authorized_keys"
#
# What it does, BEFORE any sshd is started:
#   1. normalizes $HOME/.ssh (700, owner = login user)
#   2. ensures authorized_keys exists (writes $PUBLIC_KEY if set), owned by the
#      login user, mode 0600 — the two conditions empirically proven to trigger
#      sshd StrictModes refusals are world-writability and foreign ownership
#   3. asserts the key file parses (nonempty, one key per line) so a corrupt
#      provisioning write is caught at boot, not at first login
#
# Idempotent and safe to run from any onstart/Dockerfile ENTRYPOINT layer.
# Usage: scripts/onstart-ssh-guard.sh            (uses $PUBLIC_KEY if set)
#        RUN_SSH_SELFTEST=1 scripts/onstart-ssh-guard.sh   (also docker-verify)
set -euo pipefail

LOG() { echo "[ssh-guard] $*"; }

KEY_FILE="${HOME}/.ssh/authorized_keys"
SSH_DIR="${HOME}/.ssh"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -n "${PUBLIC_KEY:-}" ] && ! grep -sqF "${PUBLIC_KEY%% *}" "$KEY_FILE" 2>/dev/null; then
  LOG "installing \$PUBLIC_KEY"
  echo "$PUBLIC_KEY" >> "$KEY_FILE"
fi

if [ ! -s "$KEY_FILE" ]; then
  LOG "ERROR: $KEY_FILE missing or empty — refusing to start sshd against an unusable key file"
  exit 1
fi

if [ "$(stat -c '%u' "$KEY_FILE" 2>/dev/null || stat -f '%u' "$KEY_FILE" 2>/dev/null)" != "$(id -u)" ]; then
  LOG "repairing ownership of $KEY_FILE (was uid $(stat -c '%u' "$KEY_FILE" 2>/dev/null))"
  chown "$(id -u):$(id -g)" "$KEY_FILE"
fi
chmod 600 "$KEY_FILE"

# Require at least one real SSH public key line (blank/comment-only files rejected)
if ! grep -Eq '^(ssh-(rsa|dss|ed25519)|ecdsa-[a-z0-9-]+|sk-[a-z]+-[a-z0-9@.]+) ' "$KEY_FILE"; then
  LOG "ERROR: $KEY_FILE contains no valid SSH public key line"
  exit 1
fi

LOG "OK: $KEY_FILE ready (uid $(id -u), mode 0600, dir 0700) — sshd may start now"