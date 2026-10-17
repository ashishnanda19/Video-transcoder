#!/usr/bin/env bash
# Stores the production secrets in AWS SSM Parameter Store as encrypted SecureStrings, where the API task and the
# upload Lambda read them at start-up.
#
# Values are typed at HIDDEN prompts (or taken from environment variables of the same name), never echoed, never
# written to a file, and never pass through Terraform (so they are not in its state either).
#
#   AWS_PROFILE=vidflow ./scripts/put-secrets.sh            # asks only for what is missing
#   AWS_PROFILE=vidflow ./scripts/put-secrets.sh --reset    # asks for everything again (e.g. to rotate)
#
# SESSION_SECRET and WEBHOOK_SECRET are random and generated here; you never need to see them.
set -euo pipefail

PREFIX="${SSM_PREFIX:-/vidflow/prod}"
REGION="${AWS_REGION:-ap-south-1}"
RESET=0; [ "${1:-}" = "--reset" ] && RESET=1
# ALLOW_PARTIAL=1: with no terminal, skip values that were not supplied instead of aborting (set them in a later run).
PARTIAL="${ALLOW_PARTIAL:-0}"

exists() { aws ssm get-parameter --name "$PREFIX/$1" --region "$REGION" >/dev/null 2>&1; }
put()    { aws ssm put-parameter --name "$PREFIX/$1" --type SecureString --value "$2" --overwrite --region "$REGION" >/dev/null; }

# ask NAME "what it is" 'regex it must match' "hint shown on mismatch"
ask() {
  local name="$1" what="$2" re="$3" hint="$4" value
  if [ "$RESET" = 0 ] && exists "$name"; then echo "  [kept]    $name (already set)"; return; fi
  value="${!name:-}"
  if [ -z "$value" ]; then
    if [ ! -t 0 ]; then
      [ "$PARTIAL" = 1 ] && { echo "  [skipped] $name (not supplied yet)"; return; }
      echo "  [missing] $name and no terminal to ask on (use ALLOW_PARTIAL=1 to skip it)" >&2; exit 1
    fi
    read -rsp "  $what: " value; echo
  fi
  if ! [[ "$value" =~ $re ]]; then echo "  [reject]  $name does not look right. $hint" >&2; exit 1; fi
  put "$name" "$value"; echo "  [stored]  $name"
}

generate() {
  if [ "$RESET" = 0 ] && exists "$1"; then echo "  [kept]    $1 (already set)"; return; fi
  put "$1" "$(openssl rand -hex 32)"; echo "  [created] $1 (random, 64 hex characters)"
}

echo "Secrets for $PREFIX in $REGION (account $(aws sts get-caller-identity --query Account --output text))"
ask MONGO_URI            "MongoDB Atlas connection string (mongodb+srv://user:password@cluster.../)" '^mongodb(\+srv)?://[^[:space:]]+$'  "It starts with mongodb+srv:// (Atlas > Connect > Drivers)."
ask REDIS_URL            "Upstash Redis URL (rediss://default:password@host:6379)"                    '^rediss?://[^[:space:]]+$'          "It starts with rediss:// (Upstash > your database > Connect > ioredis)."
ask GOOGLE_CLIENT_ID     "Google OAuth client ID (...apps.googleusercontent.com)"                      '\.apps\.googleusercontent\.com$'    "It ends with .apps.googleusercontent.com."
ask GOOGLE_CLIENT_SECRET "Google OAuth client secret"                                                  '^.{10,}$'                           "That looks too short."
generate SESSION_SECRET
generate WEBHOOK_SECRET
echo "Done. Nothing was printed or saved locally. Parameters now under $PREFIX:"
aws ssm describe-parameters --parameter-filters "Key=Path,Values=$PREFIX" --region "$REGION" --query 'Parameters[].[Name,Type,LastModifiedDate]' --output text | sed 's/\.[0-9]*+05:30//' | sort
