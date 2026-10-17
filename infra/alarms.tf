# Cost guard-rails. Created only when alarm_email is set.
locals {
  alarms_enabled = var.alarm_email != ""
}

resource "aws_sns_topic" "alarms" {
  count = local.alarms_enabled ? 1 : 0
  name  = "${local.cluster}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count     = local.alarms_enabled ? 1 : 0
  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Month-to-date spend. Billing metrics live in us-east-1 only and update a few times a day.
resource "aws_sns_topic" "billing" {
  provider = aws.billing
  count    = local.alarms_enabled ? 1 : 0
  name     = "${local.cluster}-billing-alarms"
}

resource "aws_sns_topic_subscription" "billing_email" {
  provider  = aws.billing
  count     = local.alarms_enabled ? 1 : 0
  topic_arn = aws_sns_topic.billing[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "billing" {
  provider            = aws.billing
  count               = local.alarms_enabled ? 1 : 0
  alarm_name          = "${local.cluster}-estimated-charges"
  namespace           = "AWS/Billing"
  metric_name         = "EstimatedCharges"
  dimensions          = { Currency = "USD" }
  statistic           = "Maximum"
  period              = 21600
  evaluation_periods  = 1
  threshold           = var.billing_alarm_usd
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_description   = "Estimated AWS charges reached USD ${var.billing_alarm_usd}"
  alarm_actions       = [aws_sns_topic.billing[0].arn]
}

# Scale-to-zero regressions: a GPU instance that stays up for hours is burning credits.
resource "aws_cloudwatch_metric_alarm" "gpu_instance_up_too_long" {
  count               = local.alarms_enabled ? 1 : 0
  alarm_name          = "${local.cluster}-instance-up-${var.instance_running_alarm_hours}h"
  namespace           = "AWS/AutoScaling"
  metric_name         = "GroupInServiceInstances"
  dimensions          = { AutoScalingGroupName = aws_autoscaling_group.gpu.name }
  statistic           = "Minimum"
  period              = 3600
  evaluation_periods  = var.instance_running_alarm_hours
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_description   = "At least one GPU instance has been running for ${var.instance_running_alarm_hours}+ consecutive hours (stuck job, leaked task, or scale-in not working)."
  alarm_actions       = [aws_sns_topic.alarms[0].arn]
}
