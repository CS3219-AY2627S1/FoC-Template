resource "aws_appautoscaling_target" "demo" {
  count              = local.scaling_enabled ? 1 : 0
  min_capacity       = 1
  max_capacity       = 3
  resource_id        = "service/${aws_ecs_cluster.demo[0].name}/${aws_ecs_service.app[var.autoscaling_service].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "requests" {
  count              = local.scaling_enabled ? 1 : 0
  name               = "${var.project_name}-${var.autoscaling_service}-requests"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.demo[0].resource_id
  scalable_dimension = aws_appautoscaling_target.demo[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.demo[0].service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.requests_per_target
    scale_out_cooldown = 60
    scale_in_cooldown  = 180
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.public[0].arn_suffix}/${aws_lb_target_group.app[var.autoscaling_service].arn_suffix}"
    }
  }
}
