#!/usr/bin/env bash
# Minimal reproducing test for instance-54026402:
#   "Authentication refused: bad ownership or modes for file /root/.ssh/authorized_keys"
#
# Root cause: sshd with StrictModes=yes (the OpenSSH default) refuses publickey
# auth when authorized_keys (or ~/.ssh or $HOME) is writable by group/others.
# A pod that starts serving sshd BEFORE normalizing key-file permissions has a
# window where every login through the provider tunnel is refused.
#
# This script proves the mechanism end-to-end in a throwaway container:
#   phase 1 (RED):   authorized_keys world-writable AND owned by a uid that is
#                    neither root nor the login user (how a provisioning layer
#                    with a 000 umask / foreign service account leaves it)
#                    -> sshd must REFUSE with the exact incident message
#   phase 2 (GREEN): chown root && chmod 600 -> same sshd must ACCEPT
#
# Usage: scripts/ssh-strictmodes-repro.sh
# Exit 0 = root cause reproduced and fix verified; nonzero = check failed.
set -euo pipefail

IMAGE="ubuntu:24.04"
PORT="${REPRO_PORT:-2222}"

command -v docker >/dev/null || { echo "docker required"; exit 1; }

# Key material lives entirely inside the container; generate it there.
INNER='
set -x
apt-get update -qq && apt-get install -qq -y openssh-server >/dev/null
ssh-keygen -A >/dev/null
mkdir -p /root/.ssh /run/sshd
ssh-keygen -t ed25519 -N "" -f /tmp/client_key >/dev/null
cp /tmp/client_key.pub /root/.ssh/authorized_keys

try_ssh() {  # prints "accepted" or "refused"
  ssh -p '"$PORT"' -i /tmp/client_key -o BatchMode=yes -o StrictHostKeyChecking=no \
      -o ConnectTimeout=5 -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
      root@127.0.0.1 true >/dev/null 2>&1 && echo accepted || echo refused
}

# ---- Phase 1 (RED): bad ownership/modes must be refused -------------------
chmod 666 /root/.ssh/authorized_keys
chown 1000:0 /root/.ssh/authorized_keys
chmod 700 /root/.ssh
: > /tmp/sshd.log
/usr/sbin/sshd -D -e -p '"$PORT"' -o StrictModes=yes -o PasswordAuthentication=no \
  -o ListenAddress=127.0.0.1 > /tmp/sshd.log 2>&1 &
SSHD_PID=$!
sleep 1
R1=$(try_ssh)
kill $SSHD_PID 2>/dev/null
if [ "$R1" != "refused" ]; then
  echo "FAIL phase1: expected REFUSAL with world-writable/wrong-owner key, got: $R1"; cat /tmp/sshd.log; exit 1
fi
grep -q "bad ownership or modes" /tmp/sshd.log || {
  echo "FAIL phase1: refusal present but without the strictmodes message"; cat /tmp/sshd.log; exit 1
}

# ---- Phase 2 (GREEN): normalized ownership+modes must be accepted --------
chown root:root /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
chmod 700 /root/.ssh
: > /tmp/sshd.log
/usr/sbin/sshd -D -e -p '"$PORT"' -o StrictModes=yes -o PasswordAuthentication=no \
  -o ListenAddress=127.0.0.1 > /tmp/sshd.log 2>&1 &
SSHD_PID=$!
sleep 1
R2=$(try_ssh)
kill $SSHD_PID 2>/dev/null
if [ "$R2" != "accepted" ]; then
  echo "FAIL phase2: expected ACCEPTANCE with root-owned mode-600 key, got: $R2"; cat /tmp/sshd.log; exit 1
fi

echo "REPRO OK: strictmodes refused bad-ownership/modes key; accepted root-owned mode-600 key"
'

docker rm -f ssh-strictmodes-repro >/dev/null 2>&1 || true
OUT=$(docker run --rm --name ssh-strictmodes-repro "$IMAGE" \
  bash -c "$INNER" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "REPRO OK" || exit 1