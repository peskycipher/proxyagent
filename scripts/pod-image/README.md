# Pod image — llama.cpp on vast.ai (instance 54026402 template)

Tracked source for what the vast.ai pod actually runs. Before this directory
existed, the container-side provisioning script lived only inside the deployed
image — invisible to PRs, which is how the sshd StrictModes auth window
(instance 54026402) shipped without review.

## Files

| File | Role |
|---|---|
| `Dockerfile` | Pinned base `ghcr.io/ggml-org/llama.cpp:full-cuda@sha256:6505ef7c…` (same digest production pulls); JSON exec-form ENTRYPOINT (satisfies vast's `JSONArgsRecommended` warning, lets SIGTERM reach us) |
| `onstart.sh` | Container boot: **ssh guard before anything serves** → provision weights → llama-server → optional cloudflared tunnel → supervise |
| `onstart-ssh-guard.sh` | Copy of `scripts/onstart-ssh-guard.sh` — verified fix for the "Authentication refused: bad ownership or modes" boot window (15 refused logins, ~2.5 min, instance-54026402-instance-logs.txt) |
| `provision-model.sh` | GGUF download with volume-cache skip (matches production's `[provisioning] already cached — skipping download` behavior) |

## Deploy to vast.ai

1. Build & push (from repo root):
   ```bash
   docker buildx build --platform linux/amd64 \
     -t ghcr.io/<org>/llama.cpp-full-cuda-pod:latest \
     --push scripts/pod-image/
   ```
2. Create/update the vast instance with this image and docker args
   (`-p 8080:8080/tcp` … vast remaps the host port automatically; check
   `ports["8080/tcp"][0].HostPort` via the console API).
3. Set instance env (vast template): `SERVE_PORT`, `LLAMA_MODEL_ID`,
   `LLAMA_API_KEY`, optional `TUNNEL_TOKEN` for cloudflared, optional
   `GGUF_URL`/`MODELS_DIR` overrides.

## Why the boot order is load-bearing

`onstart.sh` runs the ssh guard **before** provisioning and serving, never
after. The original production incident was unreachable-while-provisioning:
sshd served on a key file that was world-writable/foreign-owned, and every
tunnel login was refused for the whole ~2.5 min warmup. Verified end-to-end in
docker via `scripts/ssh-strictmodes-repro.sh` (phase 1 red / phase 2 green).

## Local verification

```bash
scripts/ssh-strictmodes-repro.sh          # strictmodes refusal + fix, full sshd
docker build -t pod-image-test scripts/pod-image/   # image builds
```

The guard is additionally covered by the negative checks in its own verification
run (corrupt key / empty file / newline-only all rejected before sshd starts).