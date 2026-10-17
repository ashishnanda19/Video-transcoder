#!/usr/bin/env bash
# Runs the diagnostic self-check, then hands PID 1 to the worker command.
/app/scripts/gpu-selfcheck.sh || exit $?
exec "$@"
