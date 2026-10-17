#!/usr/bin/env bash
# Generates a SYNTHETIC 1080p30 test clip (smoke-testing the harness only -- do NOT judge quality on it).
# For real numbers use real footage, e.g. a 2-minute cut of Big Buck Bunny (https://peach.blender.org/) or your own uploads:
#   ffmpeg -ss 60 -i bbb_1080p.mp4 -t 120 -c copy sample-1080p-2min.mp4
set -euo pipefail
OUT="${1:-sample-1080p.mp4}"; DURATION="${2:-120}"
ffmpeg -hide_banner -y \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30,noise=alls=10:allf=t" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -t "$DURATION" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k "$OUT"
echo "wrote $OUT (${DURATION}s)"
