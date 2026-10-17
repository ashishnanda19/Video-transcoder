#!/usr/bin/env bash
# Startup GPU self-check. Purely diagnostic: it logs loudly but does not decide the fallback.
# The Node worker runs its own functional probe (utils/gpuProbe.js) and falls back to CPU if it fails.
# Set GPU_SELFCHECK_STRICT=1 to make this script exit non-zero (container stops) when the GPU is unusable.
set -u

log()  { echo "[gpu-selfcheck] $*"; }
fail() { echo "[gpu-selfcheck] ERROR: $*" >&2; FAILED=1; }
FAILED=0

log "TRANSCODE_MODE=${TRANSCODE_MODE:-unset} NVIDIA_VISIBLE_DEVICES=${NVIDIA_VISIBLE_DEVICES:-unset} NVIDIA_DRIVER_CAPABILITIES=${NVIDIA_DRIVER_CAPABILITIES:-unset}"

if [ "${TRANSCODE_MODE:-gpu}" = "cpu" ]; then
  log "TRANSCODE_MODE=cpu, skipping GPU checks."
  exit 0
fi

log "--- nvidia-smi"
if command -v nvidia-smi >/dev/null 2>&1; then
  if ! nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader; then
    fail "nvidia-smi is present but failed. GPU is NOT visible to this container (is the task definition requesting resourceRequirements GPU=1, and is the NVIDIA runtime enabled on the host?)"
  fi
else
  fail "nvidia-smi not found. NVIDIA_DRIVER_CAPABILITIES must include 'utility' and the host must run the NVIDIA container runtime."
fi

log "--- ffmpeg NVENC encoders"
if ! ffmpeg -hide_banner -encoders 2>/dev/null | grep nvenc; then
  fail "this ffmpeg build has no NVENC encoders (wrong image?)"
fi

log "--- ffmpeg hwaccels / CUDA filters"
ffmpeg -hide_banner -hwaccels 2>/dev/null | grep -x cuda || fail "ffmpeg lacks the cuda hwaccel"
ffmpeg -hide_banner -filters 2>/dev/null | grep -E 'scale_cuda|scale_npp' || fail "ffmpeg lacks scale_cuda/scale_npp"

log "--- NVENC smoke test (1 frame, synthetic input)"
if ! ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=640x360:d=0.1 \
      -frames:v 1 -c:v h264_nvenc -f null - ; then
  fail "h264_nvenc could not initialise. Check driver version vs nv-codec-headers and that capability 'video' is enabled."
fi

if [ "$FAILED" -eq 1 ]; then
  log "RESULT: GPU NOT USABLE. The worker will fall back to CPU (libx264) unless GPU_FALLBACK_TO_CPU=false."
  [ "${GPU_SELFCHECK_STRICT:-0}" = "1" ] && exit 1
else
  log "RESULT: GPU OK"
fi
exit 0
