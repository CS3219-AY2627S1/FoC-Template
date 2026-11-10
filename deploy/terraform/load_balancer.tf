resource "aws_lb" "public" {
  count                      = var.deploy_runtime ? 1 : 0
  name                       = var.project_name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb[0].id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "app" {
  for_each             = local.public_services
  name_prefix          = "${substr(each.key, 0, 5)}-"
  port                 = each.value.port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.demo[0].id
  deregistration_delay = 15

  health_check {
    enabled             = true
    path                = each.key == "ui" ? "/" : "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Intentionally HTTP for disposable coursework data. Do not use real passwords.
resource "aws_lb_listener" "app" {
  for_each          = local.public_services
  load_balancer_arn = aws_lb.public[0].arn
  port              = each.value.public_port
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.key].arn
  }
}
