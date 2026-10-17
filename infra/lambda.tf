# S3 upload event -> Lambda -> POST to the Express server (replaces the Serverless Framework deploy of upload-trigger-api).

locals {
  lambda_name = "video-transcoder-upload-trigger"
  lambda_src  = "${path.module}/../upload-trigger-api"
  lambda_dir  = "${path.module}/.build/lambda"
}

# Builds a clean production bundle (no serverless-offline & co). Re-runs when the source or dependencies change.
resource "terraform_data" "lambda_build" {
  triggers_replace = [
    filesha256("${local.lambda_src}/index.js"),
    filesha256("${local.lambda_src}/package.json"),
  ]

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      rm -rf "${local.lambda_dir}" && mkdir -p "${local.lambda_dir}"
      cp "${local.lambda_src}/index.js" "${local.lambda_src}/package.json" "${local.lambda_dir}/"
      cd "${local.lambda_dir}" && npm install --omit=dev --no-audit --no-fund
    EOT
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = local.lambda_dir
  output_path = "${path.module}/.build/lambda.zip"
  depends_on  = [terraform_data.lambda_build]
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-upload-trigger"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_secret" {
  statement {
    sid       = "ReadWebhookSecret"
    actions   = ["ssm:GetParameter"]
    resources = ["${local.ssm_arn_prefix}/WEBHOOK_SECRET"]
  }
  statement {
    sid       = "DecryptIt"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "lambda_secret" {
  name   = "read-webhook-secret"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_secret.json
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.lambda_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "upload_trigger" {
  function_name    = local.lambda_name
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  # A sleeping Render instance can take ~50s to wake; the default 3s timeout would drop the upload event.
  timeout = 60

  environment {
    variables = {
      API_ENDPOINT = var.lambda_api_endpoint != "" ? var.lambda_api_endpoint : "${local.api_url}/api/v1/video/s3-trigger"
      # The shared secret itself stays in SSM; the function fetches it when it starts.
      WEBHOOK_SECRET_PARAM = "${local.ssm_prefix}/WEBHOOK_SECRET"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy_attachment.lambda_logs]
}

resource "aws_lambda_permission" "s3_invoke" {
  statement_id   = "AllowS3Invoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.upload_trigger.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.temp.arn
  source_account = local.account_id
}

resource "aws_s3_bucket_notification" "temp_upload" {
  bucket = aws_s3_bucket.temp.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.upload_trigger.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/videos/"
  }

  depends_on = [aws_lambda_permission.s3_invoke]
}
