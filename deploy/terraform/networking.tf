data "aws_availability_zones" "available" {
  count = var.deploy_runtime ? 1 : 0
  state = "available"
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required", "opted-in"]
  }
}

resource "aws_vpc" "demo" {
  count                = var.deploy_runtime ? 1 : 0
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.project_name }
}

resource "aws_subnet" "public" {
  count                   = var.deploy_runtime ? 2 : 0
  vpc_id                  = aws_vpc.demo[0].id
  cidr_block              = cidrsubnet(aws_vpc.demo[0].cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available[0].names[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.project_name}-public-${count.index + 1}" }
}

resource "aws_internet_gateway" "demo" {
  count  = var.deploy_runtime ? 1 : 0
  vpc_id = aws_vpc.demo[0].id
}

resource "aws_route_table" "public" {
  count  = var.deploy_runtime ? 1 : 0
  vpc_id = aws_vpc.demo[0].id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo[0].id
  }
}

resource "aws_route_table_association" "public" {
  count          = var.deploy_runtime ? 2 : 0
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_security_group" "alb" {
  count       = var.deploy_runtime ? 1 : 0
  name_prefix = "${var.project_name}-alb-"
  description = "Public demo entry point, restricted to configured source CIDRs"
  vpc_id      = aws_vpc.demo[0].id
}

resource "aws_security_group" "task" {
  for_each    = local.runtime_services
  name_prefix = "${var.project_name}-${each.key}-"
  description = "${each.key} task; no direct public ingress"
  vpc_id      = aws_vpc.demo[0].id
}

resource "aws_security_group" "mq" {
  count       = var.deploy_runtime ? 1 : 0
  name_prefix = "${var.project_name}-mq-"
  description = "Private RabbitMQ; AMQPS from backend task groups only"
  vpc_id      = aws_vpc.demo[0].id
}

locals {
  public_ingress = {
    for pair in setproduct(toset(keys(local.public_services)), var.allowed_ingress_cidrs) :
    "${pair[0]}:${pair[1]}" => { service = pair[0], cidr = pair[1] }
  }
}

resource "aws_vpc_security_group_ingress_rule" "public" {
  for_each          = local.public_ingress
  security_group_id = aws_security_group.alb[0].id
  cidr_ipv4         = each.value.cidr
  ip_protocol       = "tcp"
  from_port         = local.services[each.value.service].public_port
  to_port           = local.services[each.value.service].public_port
}

resource "aws_vpc_security_group_egress_rule" "alb_to_task" {
  for_each                     = local.public_services
  security_group_id            = aws_security_group.alb[0].id
  referenced_security_group_id = aws_security_group.task[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}

resource "aws_vpc_security_group_ingress_rule" "alb_to_backend" {
  for_each                     = local.public_services
  security_group_id            = aws_security_group.task[each.key].id
  referenced_security_group_id = aws_security_group.alb[0].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}

resource "aws_vpc_security_group_ingress_rule" "gateway_to_backend" {
  for_each                     = local.runtime_backends
  security_group_id            = aws_security_group.task[each.key].id
  referenced_security_group_id = aws_security_group.task["internal-gateway"].id
  ip_protocol                  = "tcp"
  from_port                    = local.services[each.key].port
  to_port                      = local.services[each.key].port
}

resource "aws_vpc_security_group_ingress_rule" "to_gateway" {
  for_each                     = var.deploy_runtime ? setunion(local.backend_names, toset(["ui"])) : toset([])
  security_group_id            = aws_security_group.task["internal-gateway"].id
  referenced_security_group_id = aws_security_group.task[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_vpc_security_group_egress_rule" "task" {
  for_each          = local.runtime_services
  security_group_id = aws_security_group.task[each.key].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_ingress_rule" "backend_to_mq" {
  for_each                     = local.runtime_backends
  security_group_id            = aws_security_group.mq[0].id
  referenced_security_group_id = aws_security_group.task[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = 5671
  to_port                      = 5671
}

resource "aws_vpc_security_group_egress_rule" "mq" {
  count             = var.deploy_runtime ? 1 : 0
  security_group_id = aws_security_group.mq[0].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
