#!/usr/bin/env bash
# Builds the app image (UI + API, see Dockerfile.api), pushes it to ECR and rolls the running service onto it.
#   AWS_PROFILE=vidflow ./scripts/deploy-api.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
REPO="$REGISTRY/vidflow-api"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker buildx build --platform linux/amd64 -f Dockerfile.api -t "$REPO:latest" --push .

DESIRED="$(aws ecs describe-services --cluster vidflow-api --services vidflow-api --region "$REGION" --query 'services[0].desiredCount' --output text)"
if [ "$DESIRED" = "0" ]; then
  echo "Image pushed. The service is at 0 tasks (secrets not set up yet?), so nothing to roll. See docs/go-live.md."
  exit 0
fi

echo "Rolling the service onto the new image (the old task keeps serving until the new one is healthy)..."
aws ecs update-service --cluster vidflow-api --service vidflow-api --force-new-deployment --region "$REGION" >/dev/null
aws ecs wait services-stable --cluster vidflow-api --services vidflow-api --region "$REGION"
echo "Deployed. Check it: node scripts/check-live.js"
