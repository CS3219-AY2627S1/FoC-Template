resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.runtime_services
  name              = "/ecs/${var.project_name}/${each.key}"
  retention_in_days = 7
}

resource "aws_cloudwatch_dashboard" "demo" {
  count          = var.deploy_runtime ? 1 : 0
  dashboard_name = "${var.project_name}-demo"
  dashboard_body = jsonencode({
    widgets = [for index, name in sort(keys(local.public_services)) : {
      type = "metric", x = (index % 2) * 12, y = floor(index / 2) * 6, width = 12, height = 6
      properties = {
        title  = "${name}: direct target group requests, latency and errors"
        region = var.aws_region
        view   = "timeSeries"
        period = 60
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.public[0].arn_suffix, "TargetGroup", aws_lb_target_group.app[name].arn_suffix, { stat = "Sum" }],
          ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.public[0].arn_suffix, "TargetGroup", aws_lb_target_group.app[name].arn_suffix, { stat = "p95", yAxis = "right" }],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.public[0].arn_suffix, "TargetGroup", aws_lb_target_group.app[name].arn_suffix, { stat = "Sum" }]
        ]
      }
    }]
  })
}
