# What lets the instance be operated without anyone's laptop: GitHub Actions may start, stop
# and restart it, and an alarm stops it when it has been left running without use.

# GitHub Actions proves who it is with a short-lived OpenID Connect token, so no AWS keys are
# stored in GitHub.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Only workflows running on these branches, never pull requests or other branches.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for branch in var.github_branches : "repo:${var.github_repository}:ref:refs/heads/${branch}"]
    }
  }
}

resource "aws_iam_role" "github" {
  name               = "relay-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

# Just enough to start, stop and look at the instance and to run the restart command on it.
data "aws_iam_policy_document" "github" {
  statement {
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  statement {
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.relay.arn]
  }

  statement {
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.relay.arn,
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github" {
  name   = "operate-relay-instance"
  role   = aws_iam_role.github.id
  policy = data.aws_iam_policy_document.github.json
}

# The instance's own role: lets AWS Systems Manager run commands on it, so a deploy from
# GitHub Actions needs neither SSH nor an open Kubernetes API.
data "aws_iam_policy_document" "instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "relay-instance"
  assume_role_policy = data.aws_iam_policy_document.instance_assume.json
}

resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "relay-instance"
  role = aws_iam_role.instance.name
}

# A forgotten instance would use up the sandbox budget in about ten days. Relay without users
# stays around 5 % CPU, so four hours below 10 % means nobody is using it.
resource "aws_cloudwatch_metric_alarm" "idle" {
  alarm_name          = "relay-idle-stop"
  alarm_description   = "Stops the Relay instance after 4 hours without use."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 48
  datapoints_to_alarm = 48
  threshold           = 10
  comparison_operator = "LessThanThreshold"
  # A stopped instance sends no data, which must not count as idle.
  treat_missing_data = "notBreaching"
  alarm_actions      = ["arn:aws:automate:${var.region}:ec2:stop"]

  dimensions = {
    InstanceId = aws_instance.relay.id
  }
}
