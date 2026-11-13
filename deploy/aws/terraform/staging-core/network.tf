resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name_prefix }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name_prefix }
}

resource "aws_subnet" "public" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, each.value)
  map_public_ip_on_launch = true

  tags = {
    Name                     = "${local.name_prefix}-public-${each.key}"
    "kubernetes.io/role/elb" = "1"
  }
}

resource "aws_subnet" "application" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 10)

  tags = {
    Name                              = "${local.name_prefix}-app-${each.key}"
    "kubernetes.io/role/internal-elb" = "1"
  }
}

resource "aws_subnet" "database" {
  for_each = { for index, az in local.azs : az => index }

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 20)

  tags = { Name = "${local.name_prefix}-db-${each.key}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name_prefix}-nat" }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = values(aws_subnet.public)[0].id
  tags          = { Name = local.name_prefix }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name_prefix}-public" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${local.name_prefix}-private" }
}

resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-database" }
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  route_table_id = aws_route_table.public.id
  subnet_id      = each.value.id
}

resource "aws_route_table_association" "application" {
  for_each       = aws_subnet.application
  route_table_id = aws_route_table.private.id
  subnet_id      = each.value.id
}

resource "aws_route_table_association" "database" {
  for_each       = aws_subnet.database
  route_table_id = aws_route_table.database.id
  subnet_id      = each.value.id
}

# Keep private Chat attachment traffic off the NAT gateway. S3 gateway endpoints have no hourly
# charge and apply to the private application route table used by EKS workloads.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = { Name = "${local.name_prefix}-s3" }
}

resource "aws_security_group" "gateway_alb" {
  name        = "${local.name_prefix}-gateway-alb"
  description = "Internal ALB reached only from CloudFront VPC-origin ENIs inside the VPC"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from private VPC origin interfaces"
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "Gateway targets"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  # staging-edge owns the additional CloudFront VPC-origin ingress rule. Ignore ingress drift here
  # so a later core apply does not delete that separately managed rule from this shared group.
  lifecycle {
    ignore_changes = [ingress]
  }

  tags = { Name = "${local.name_prefix}-gateway-alb" }
}
