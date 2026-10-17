# Upload (temp) and output (final) buckets. Names are global; the defaults match what the app code falls back to.

resource "aws_s3_bucket" "temp" {
  bucket        = var.temp_bucket_name
  force_destroy = true # holds only in-flight uploads, safe to delete
}

resource "aws_s3_bucket" "final" {
  bucket        = var.final_bucket_name
  force_destroy = var.final_bucket_force_destroy
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = { temp = aws_s3_bucket.temp.id, final = aws_s3_bucket.final.id }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Browsers upload straight to S3 with a presigned PUT and play/download outputs with presigned GETs.
resource "aws_s3_bucket_cors_configuration" "this" {
  for_each = { temp = aws_s3_bucket.temp.id, final = aws_s3_bucket.final.id }
  bucket   = each.value

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = distinct(concat([local.public_url, local.api_url], var.cors_allowed_origins))
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "temp" {
  bucket = aws_s3_bucket.temp.id

  rule {
    id     = "expire-leftover-uploads"
    status = "Enabled"
    filter {}
    expiration {
      days = var.temp_upload_expiry_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Backstop for the server's own retention sweep: even if it never ran, nothing outlives retention_days + 3.
resource "aws_s3_bucket_lifecycle_configuration" "final" {
  count  = var.retention_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.final.id

  rule {
    id     = "expire-old-renditions"
    status = "Enabled"
    filter {}
    expiration {
      days = var.retention_days + 3
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
