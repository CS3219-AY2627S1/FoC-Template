locals {
  tags = { Project = "FoC", Environment = var.name_prefix }
}

data "aws_availability_zones" "available" { state = "available" }

resource "aws_vpc" "app" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(local.tags, { Name = var.name_prefix })
}

resource "aws_internet_gateway" "app" { vpc_id = aws_vpc.app.id }

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.app.id
  cidr_block              = "10.42.0.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true
}

resource "aws_subnet" "database" {
  for_each          = { a = 1, b = 2 }
  vpc_id            = aws_vpc.app.id
  cidr_block        = "10.42.${each.value}.0/24"
  availability_zone = data.aws_availability_zones.available.names[each.value - 1]
}

resource "aws_route_table" "public" { vpc_id = aws_vpc.app.id }

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.app.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "gateway" {
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${var.name_prefix}-gateway" })
}

resource "aws_service_discovery_private_dns_namespace" "app" {
  name = "${var.name_prefix}.internal"
  vpc  = aws_vpc.app.id
}

resource "aws_security_group" "compute" {
  name_prefix = "${var.name_prefix}-compute-"
  description = "Public gateway; ECS bridge ports only between ECS hosts. No SSH."
  vpc_id      = aws_vpc.app.id
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.compute.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
}

resource "aws_vpc_security_group_ingress_rule" "ecs_ports" {
  security_group_id            = aws_security_group.compute.id
  referenced_security_group_id = aws_security_group.compute.id
  ip_protocol                  = "tcp"
  from_port                    = 32768
  to_port                      = 65535
}

resource "aws_vpc_security_group_egress_rule" "compute" {
  security_group_id = aws_security_group.compute.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "database" {
  name_prefix = "${var.name_prefix}-database-"
  vpc_id      = aws_vpc.app.id
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.compute.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
