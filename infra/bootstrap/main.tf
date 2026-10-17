data "aws_caller_identity" "current" {}

locals {
  acct = data.aws_caller_identity.current.account_id
  p    = var.name_prefix

  buckets = [
    "arn:aws:s3:::${var.temp_bucket_name}",
    "arn:aws:s3:::${var.final_bucket_name}",
  ]
  bucket_objects = [for b in local.buckets : "${b}/*"]

  deploy_user_arn = "arn:aws:iam::${local.acct}:user/${var.deploy_user_name}"
  server_user_arn = "arn:aws:iam::${local.acct}:user/${var.server_iam_user_name}"

  # AWS managed policies the VidFlow roles are allowed to get attached (see infra/iam.tf).
  allowed_managed_policies = [
    "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    "arn:aws:iam::${local.acct}:policy/${local.p}-*",
  ]
}

resource "aws_iam_user" "deploy" {
  name = var.deploy_user_name
  path = "/"
}

# ---------------------------------------------------------------------------------------------------------------
# 1/4  IAM: only vidflow-* roles / policies / instance profiles and the single vidflow-server user
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "iam" {
  statement {
    sid = "ManageVidflowRoles"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:SimulatePrincipalPolicy",
    ]
    resources = ["arn:aws:iam::${local.acct}:role/${local.p}-*"]
  }

  # Without this a vidflow role could be given AdministratorAccess. Only the managed policies VidFlow uses.
  statement {
    sid       = "AttachOnlyKnownPoliciesToRoles"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.p}-*"]
    condition {
      test     = "ArnLike"
      variable = "iam:PolicyARN"
      values   = local.allowed_managed_policies
    }
  }

  statement {
    sid       = "PassVidflowRolesToTheirServices"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.acct}:role/${local.p}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com", "ec2.amazonaws.com", "lambda.amazonaws.com"]
    }
  }

  statement {
    sid = "ManageVidflowInstanceProfiles"
    actions = [
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile", "iam:UntagInstanceProfile", "iam:ListInstanceProfileTags",
    ]
    resources = ["arn:aws:iam::${local.acct}:instance-profile/${local.p}-*"]
  }

  statement {
    sid = "ManageVidflowPolicies"
    actions = [
      "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion",
      "iam:TagPolicy", "iam:UntagPolicy", "iam:ListPolicyTags",
    ]
    resources = ["arn:aws:iam::${local.acct}:policy/${local.p}-*"]
  }

  statement {
    sid = "ManageTheServerUserOnly"
    actions = [
      "iam:CreateUser", "iam:DeleteUser", "iam:GetUser", "iam:TagUser", "iam:UntagUser", "iam:ListUserTags",
      "iam:ListAttachedUserPolicies", "iam:ListUserPolicies", "iam:ListGroupsForUser",
      "iam:CreateAccessKey", "iam:ListAccessKeys", "iam:DeleteAccessKey", "iam:UpdateAccessKey",
      "iam:SimulatePrincipalPolicy",
    ]
    resources = [local.server_user_arn]
  }

  statement {
    sid       = "AttachOnlyVidflowPoliciesToTheServerUser"
    actions   = ["iam:AttachUserPolicy", "iam:DetachUserPolicy"]
    resources = [local.server_user_arn]
    condition {
      test     = "ArnLike"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::${local.acct}:policy/${local.p}-*"]
    }
  }

  statement {
    sid       = "ReadDeployUserForVerification"
    actions   = ["iam:GetUser", "iam:SimulatePrincipalPolicy", "iam:ListAttachedUserPolicies"]
    resources = [local.deploy_user_arn]
  }

  # First ECS capacity provider / Auto Scaling group in an account creates these account-wide roles.
  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["ecs.amazonaws.com", "autoscaling.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------------------------------------------
# 2/4  Compute: ECS, EC2 (launch template + security group), Auto Scaling, ECR
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "compute" {
  # --- ECS
  statement {
    sid = "EcsClusters"
    actions = [
      "ecs:CreateCluster", "ecs:DeleteCluster", "ecs:UpdateCluster", "ecs:UpdateClusterSettings",
      "ecs:PutClusterCapacityProviders", "ecs:DescribeClusters", "ecs:ListContainerInstances",
      "ecs:TagResource", "ecs:UntagResource", "ecs:ListTagsForResource",
    ]
    resources = ["arn:aws:ecs:*:${local.acct}:cluster/${local.p}-*"]
  }
  statement {
    sid       = "EcsCapacityProvidersCreateAndDescribe"
    actions   = ["ecs:CreateCapacityProvider", "ecs:DescribeCapacityProviders"]
    resources = ["*"] # these two actions do not support resource-level permissions
  }
  statement {
    sid       = "EcsCapacityProvidersManage"
    actions   = ["ecs:UpdateCapacityProvider", "ecs:DeleteCapacityProvider", "ecs:TagResource", "ecs:UntagResource", "ecs:ListTagsForResource"]
    resources = ["arn:aws:ecs:*:${local.acct}:capacity-provider/${local.p}-*"]
  }
  statement {
    sid = "EcsTaskDefinitions"
    actions = [
      "ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition", "ecs:DescribeTaskDefinition",
      "ecs:ListTaskDefinitions", "ecs:ListTaskDefinitionFamilies", "ecs:DeleteTaskDefinitions", "ecs:TagResource",
    ]
    resources = ["*"] # task-definition actions cannot be scoped; the PassRole rule above limits which roles they can use
  }
  statement {
    sid       = "EcsRunTask"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:*:${local.acct}:task-definition/${local.p}-*:*"]
    condition {
      test     = "ArnLike"
      variable = "ecs:cluster"
      values   = ["arn:aws:ecs:*:${local.acct}:cluster/${local.p}-*"]
    }
  }
  statement {
    sid       = "EcsTasksInVidflowClusters"
    actions   = ["ecs:StopTask", "ecs:DescribeTasks", "ecs:DescribeContainerInstances"]
    resources = ["arn:aws:ecs:*:${local.acct}:task/${local.p}-*/*", "arn:aws:ecs:*:${local.acct}:container-instance/${local.p}-*/*"]
  }
  statement {
    sid       = "EcsListTasks"
    actions   = ["ecs:ListTasks", "ecs:ListClusters"]
    resources = ["*"]
  }

  # --- EC2
  statement {
    sid       = "Ec2ReadOnly"
    actions   = ["ec2:Describe*", "ec2:GetLaunchTemplateData"]
    resources = ["*"]
  }
  statement {
    sid       = "Ec2CreateLaunchTemplateTaggedAsVidflow"
    actions   = ["ec2:CreateLaunchTemplate"]
    resources = ["arn:aws:ec2:*:${local.acct}:launch-template/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["vidflow"]
    }
  }
  statement {
    sid       = "Ec2ChangeOnlyVidflowLaunchTemplates"
    actions   = ["ec2:CreateLaunchTemplateVersion", "ec2:ModifyLaunchTemplate", "ec2:DeleteLaunchTemplate", "ec2:DeleteLaunchTemplateVersions"]
    resources = ["arn:aws:ec2:*:${local.acct}:launch-template/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Project"
      values   = ["vidflow"]
    }
  }
  statement {
    sid       = "Ec2CreateSecurityGroupInAnyVpc"
    actions   = ["ec2:CreateSecurityGroup"]
    resources = ["arn:aws:ec2:*:${local.acct}:vpc/*"]
  }
  statement {
    sid       = "Ec2CreateSecurityGroupTaggedAsVidflow"
    actions   = ["ec2:CreateSecurityGroup"]
    resources = ["arn:aws:ec2:*:${local.acct}:security-group/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["vidflow"]
    }
  }
  statement {
    sid = "Ec2ChangeOnlyVidflowSecurityGroups"
    actions = [
      "ec2:DeleteSecurityGroup", "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress", "ec2:ModifySecurityGroupRules",
      "ec2:UpdateSecurityGroupRuleDescriptionsIngress", "ec2:UpdateSecurityGroupRuleDescriptionsEgress",
    ]
    resources = ["arn:aws:ec2:*:${local.acct}:security-group/*", "arn:aws:ec2:*:${local.acct}:security-group-rule/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Project"
      values   = ["vidflow"]
    }
  }
  statement {
    sid       = "Ec2TagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:aws:ec2:*:${local.acct}:launch-template/*", "arn:aws:ec2:*:${local.acct}:security-group/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateLaunchTemplate", "CreateSecurityGroup"]
    }
  }
  statement {
    sid       = "Ec2RetagOnlyVidflowResources"
    actions   = ["ec2:CreateTags", "ec2:DeleteTags"]
    resources = ["arn:aws:ec2:*:${local.acct}:launch-template/*", "arn:aws:ec2:*:${local.acct}:security-group/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Project"
      values   = ["vidflow"]
    }
  }
  # Creating an Auto Scaling group from a launch template validates that the caller could launch it.
  statement {
    sid       = "Ec2RunInstancesForAutoScalingValidation"
    actions   = ["ec2:RunInstances"]
    resources = ["*"]
  }

  # --- Auto Scaling
  statement {
    sid       = "AutoScalingReadOnly"
    actions   = ["autoscaling:Describe*"]
    resources = ["*"]
  }
  statement {
    sid = "AutoScalingVidflowGroups"
    actions = [
      "autoscaling:CreateAutoScalingGroup", "autoscaling:UpdateAutoScalingGroup", "autoscaling:DeleteAutoScalingGroup",
      "autoscaling:EnableMetricsCollection", "autoscaling:DisableMetricsCollection", "autoscaling:SetDesiredCapacity",
      "autoscaling:SetInstanceProtection", "autoscaling:TerminateInstanceInAutoScalingGroup",
      "autoscaling:SuspendProcesses", "autoscaling:ResumeProcesses", "autoscaling:PutScalingPolicy",
      "autoscaling:CreateOrUpdateTags", "autoscaling:DeleteTags",
    ]
    resources = ["arn:aws:autoscaling:*:${local.acct}:autoScalingGroup:*:autoScalingGroupName/${local.p}-*"]
  }

  # --- ECR
  statement {
    sid = "EcrVidflowRepositories"
    actions = [
      "ecr:CreateRepository", "ecr:DeleteRepository", "ecr:DescribeRepositories", "ecr:DescribeImages", "ecr:ListImages",
      "ecr:BatchDeleteImage", "ecr:PutLifecyclePolicy", "ecr:GetLifecyclePolicy", "ecr:DeleteLifecyclePolicy",
      "ecr:PutImageScanningConfiguration", "ecr:PutImageTagMutability", "ecr:GetRepositoryPolicy",
      "ecr:TagResource", "ecr:UntagResource", "ecr:ListTagsForResource",
      # docker push / pull
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload",
      "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
    ]
    resources = ["arn:aws:ecr:*:${local.acct}:repository/${local.p}-*"]
  }
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
}

# ---------------------------------------------------------------------------------------------------------------
# 3/4  Application services: S3 (two buckets), Lambda, Logs, CloudWatch alarms, SNS, SSM, Service Quotas
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "app" {
  statement {
    sid       = "S3VidflowBuckets"
    actions   = ["s3:*"]
    resources = concat(local.buckets, local.bucket_objects)
  }
  statement {
    sid       = "S3ListBucketNames"
    actions   = ["s3:ListAllMyBuckets"]
    resources = ["*"]
  }

  statement {
    sid       = "LambdaVidflowFunctions"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:*:${local.acct}:function:${var.lambda_name_prefix}-*"]
  }

  statement {
    sid = "LogsVidflowGroups"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource", "logs:ListTagsLogGroup",
      "logs:TagLogGroup", "logs:UntagLogGroup", "logs:GetLogEvents", "logs:FilterLogEvents", "logs:DescribeLogStreams",
    ]
    resources = [
      "arn:aws:logs:*:${local.acct}:log-group:/ecs/${local.p}-*",
      "arn:aws:logs:*:${local.acct}:log-group:/ecs/${local.p}-*:*",
      "arn:aws:logs:*:${local.acct}:log-group:/aws/lambda/${var.lambda_name_prefix}-*",
      "arn:aws:logs:*:${local.acct}:log-group:/aws/lambda/${var.lambda_name_prefix}-*:*",
    ]
  }
  statement {
    sid       = "LogsDescribe"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  statement {
    sid       = "CloudWatchVidflowAlarms"
    actions   = ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource"]
    resources = ["arn:aws:cloudwatch:*:${local.acct}:alarm:${local.p}-*"]
  }
  statement {
    sid       = "CloudWatchDescribe"
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["*"]
  }

  statement {
    sid = "SnsVidflowTopics"
    actions = [
      "sns:CreateTopic", "sns:DeleteTopic", "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:Subscribe",
      "sns:Unsubscribe", "sns:GetSubscriptionAttributes", "sns:ListSubscriptionsByTopic",
      "sns:TagResource", "sns:UntagResource", "sns:ListTagsForResource",
    ]
    resources = ["arn:aws:sns:*:${local.acct}:${local.p}-*"]
  }

  statement {
    sid       = "SsmPublicEcsAmiParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:*::parameter/aws/service/ecs/*"]
  }

  statement {
    sid = "ServiceQuotas"
    actions = [
      "servicequotas:GetServiceQuota", "servicequotas:ListServiceQuotas", "servicequotas:GetAWSDefaultServiceQuota",
      "servicequotas:RequestServiceQuotaIncrease", "servicequotas:GetRequestedServiceQuotaChange",
      "servicequotas:ListRequestedServiceQuotaChangeHistory", "servicequotas:ListRequestedServiceQuotaChangeHistoryByQuota",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "TagLookup"
    actions   = ["tag:GetResources"]
    resources = ["*"]
  }
}

# ---------------------------------------------------------------------------------------------------------------
# 4/4  Guardrails: explicit Deny. A Deny overrides every Allow above, whatever gets added later.
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "guardrails" {
  # Other projects in the account (e.g. aegis-*): never touchable by VidFlow's deploy identity.
  statement {
    sid    = "DenyOtherProjects"
    effect = "Deny"
    actions = [
      "iam:*", "s3:*", "ecs:*", "ecr:*", "lambda:*", "logs:*", "sns:*", "cloudwatch:*", "autoscaling:*",
    ]
    resources = flatten([
      for x in var.protected_prefixes : [
        "arn:aws:s3:::${x}-*",
        "arn:aws:s3:::${x}-*/*",
        "arn:aws:iam::*:user/${x}-*",
        "arn:aws:iam::*:role/${x}-*",
        "arn:aws:iam::*:policy/${x}-*",
        "arn:aws:iam::*:instance-profile/${x}-*",
        "arn:aws:iam::*:group/${x}-*",
        "arn:aws:ecs:*:*:*/${x}-*",
        "arn:aws:ecs:*:*:task-definition/${x}-*:*",
        "arn:aws:ecr:*:*:repository/${x}-*",
        "arn:aws:lambda:*:*:function:${x}-*",
        "arn:aws:logs:*:*:log-group:*${x}*",
        "arn:aws:logs:*:*:log-group:*${x}*:*",
        "arn:aws:sns:*:*:${x}-*",
        "arn:aws:cloudwatch:*:*:alarm:${x}-*",
        "arn:aws:autoscaling:*:*:autoScalingGroup:*:autoScalingGroupName/${x}-*",
      ]
    ])
  }

  # The deploy identity must not be able to widen its own permissions or mint extra keys for itself.
  statement {
    sid    = "DenySelfModification"
    effect = "Deny"
    actions = [
      "iam:AttachUserPolicy", "iam:DetachUserPolicy", "iam:PutUserPolicy", "iam:DeleteUserPolicy",
      "iam:UpdateUser", "iam:DeleteUser", "iam:CreateAccessKey", "iam:UpdateAccessKey", "iam:DeleteAccessKey",
      "iam:PutUserPermissionsBoundary", "iam:DeleteUserPermissionsBoundary",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:DeletePolicy",
    ]
    resources = [
      local.deploy_user_arn,
      "arn:aws:iam::${local.acct}:policy/${var.deploy_user_name}-*",
    ]
  }
}

locals {
  policy_docs = {
    iam        = data.aws_iam_policy_document.iam.json
    compute    = data.aws_iam_policy_document.compute.json
    app        = data.aws_iam_policy_document.app.json
    guardrails = data.aws_iam_policy_document.guardrails.json
  }
  # IAM counts non-whitespace characters, max 6144 per managed policy.
  policy_sizes = { for k, v in local.policy_docs : k => length(replace(v, "/\\s+/", "")) }
}

resource "aws_iam_policy" "deploy" {
  for_each = local.policy_docs

  name        = "${var.deploy_user_name}-${each.key}"
  description = "VidFlow deploy identity (${each.key}); scoped to ${var.name_prefix}-* resources"
  policy      = each.value

  lifecycle {
    precondition {
      condition     = local.policy_sizes[each.key] <= 6144
      error_message = "Policy ${each.key} is ${local.policy_sizes[each.key]} characters; IAM's limit is 6144. Split it."
    }
  }
}

resource "aws_iam_user_policy_attachment" "deploy" {
  for_each   = aws_iam_policy.deploy
  user       = aws_iam_user.deploy.name
  policy_arn = each.value.arn
}
