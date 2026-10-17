#!/usr/bin/env bash
# Mints an access key for the VidFlow deploy user and stores it ONLY in a local AWS CLI profile.
# The secret is never printed and never goes through Terraform state (that is why this is a script, not a resource).
#
#   ./create-profile.sh [user=vidflow-deploy] [profile=vidflow] [region=ap-south-1]
#
# Run it with an identity that may create access keys for the user (the same admin profile used for the bootstrap
# apply). ROTATE=1 replaces an existing key.
set -euo pipefail

USER_NAME="${1:-vidflow-deploy}"
PROFILE="${2:-vidflow}"
REGION="${3:-ap-south-1}"

if [ "${AWS_PROFILE:-}" = "$PROFILE" ]; then
  echo "Unset AWS_PROFILE (or use the admin profile): this script must run as the admin, not as '$PROFILE'." >&2
  exit 1
fi

existing=$(aws iam list-access-keys --user-name "$USER_NAME" --query 'AccessKeyMetadata[].AccessKeyId' --output text)
if [ -n "$existing" ]; then
  if [ "${ROTATE:-0}" != "1" ]; then
    echo "$USER_NAME already has an access key ($existing). Re-run with ROTATE=1 to replace it." >&2
    exit 1
  fi
  for k in $existing; do aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$k"; done
  echo "deleted old key(s): $existing"
fi

read -r KEY_ID SECRET < <(aws iam create-access-key --user-name "$USER_NAME" \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

aws configure set aws_access_key_id "$KEY_ID" --profile "$PROFILE"
aws configure set aws_secret_access_key "$SECRET" --profile "$PROFILE"
aws configure set region "$REGION" --profile "$PROFILE"
aws configure set output json --profile "$PROFILE"
unset SECRET

echo "Profile '$PROFILE' written (key $KEY_ID). Verifying (new keys can take a few seconds to propagate)..."
for i in $(seq 1 12); do
  if arn=$(aws sts get-caller-identity --profile "$PROFILE" --query Arn --output text 2>/dev/null); then
    echo "OK: $arn"
    echo "Use it with:  export AWS_PROFILE=$PROFILE"
    exit 0
  fi
  sleep 3
done
echo "Key created but not usable yet; try again in a minute: aws sts get-caller-identity --profile $PROFILE" >&2
exit 1
