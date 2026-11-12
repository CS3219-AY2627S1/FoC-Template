# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# Network layout: one VPC, three tiers of subnets, repeated in each Availability Zone (AZ).
#
#   10.0.0.0/16  VPC (65,536 addresses)
#   ├── public    10.0.0.0/24,  10.0.1.0/24    ALB, NAT gateway        route: 0.0.0.0/0 -> internet gateway
#   ├── private   10.0.32.0/19, 10.0.64.0/19   EKS nodes AND pods      route: 0.0.0.0/0 -> NAT gateway
#   └── database  10.0.10.0/24, 10.0.11.0/24   RDS                     no internet route at all
#
# Why the private subnets are so big (8,192 addresses each): on EKS, every pod gets its own VPC IP
# address (VPC CNI), so pods use up subnet space quickly. Too small, and new pods can't start.
#
# Written with plain resources (rather than the popular terraform-aws-modules/vpc module) so each
# piece is visible. The module builds the same thing in about 20 lines once this is familiar.

locals {
  # The first N AZs in the region, e.g. ["ap-southeast-1a", "ap-southeast-1b"]
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # cidrsubnet(base, extra_bits, index) carves a smaller block out of base:
  #   /16 + 8 bits = /24 blocks, /16 + 3 bits = /19 blocks
  public_subnet_cidrs   = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i)]      # 10.0.0.0/24, 10.0.1.0/24
  database_subnet_cidrs = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, 10 + i)] # 10.0.10.0/24, 10.0.11.0/24
  private_subnet_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 3, 1 + i)]  # 10.0.32.0/19, 10.0.64.0/19

  # One NAT gateway in total, or one per AZ (see var.single_nat_gateway)
  nat_gateway_count = var.single_nat_gateway ? 1 : var.az_count

  cluster_name = var.project # used in the EKS step; subnets are tagged for it below
}

data "aws_availability_zones" "available" {
  state = "available"

  # Skip Local Zones / Wavelength Zones, which EKS and RDS don't fully support
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# --- VPC -------------------------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr

  # Both required by EKS and RDS: resources get DNS names, and those names resolve inside the VPC
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = var.project
  }
}

# Every new VPC comes with a "default" security group that allows all traffic between its members.
# Taking it over with no rules disables it, so nothing can accidentally rely on it.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project}-default-unused"
  }
}

# --- Public tier -----------------------------------------------------------------------------------
# The VPC's door to the internet, for the public subnets
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = var.project
  }
}

resource "aws_subnet" "public" {
  count = var.az_count

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.public_subnet_cidrs[count.index]

  # Nothing launched here gets a public IP automatically: the ALB and NAT gateway get theirs explicitly
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project}-public-${local.azs[count.index]}"
    # AWS Load Balancer Controller: put internet-facing ALBs in subnets with this tag
    "kubernetes.io/role/elb" = "1"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"                  # everything outside the VPC...
    gateway_id = aws_internet_gateway.main.id # ...goes straight to the internet
  }

  tags = {
    Name = "${var.project}-public"
  }
}

resource "aws_route_table_association" "public" {
  count = var.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# --- NAT gateway -----------------------------------------------------------------------------------
# Lets private subnets make OUTGOING connections (pull images from quay.io / Docker Hub, call AWS
# APIs) while nothing on the internet can connect IN. Lives in a public subnet, with a fixed public IP.
#
# Cost: roughly USD 0.06/hour each (~USD 45/month) plus data processed. That's why one shared
# NAT gateway is the default. Its trade-off: if its AZ goes down, private subnets in the other AZ
# also lose internet access.
resource "aws_eip" "nat" {
  count  = local.nat_gateway_count
  domain = "vpc"

  tags = {
    Name = "${var.project}-nat-${local.azs[count.index]}"
  }
}

resource "aws_nat_gateway" "main" {
  count = local.nat_gateway_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "${var.project}-${local.azs[count.index]}"
  }

  # The NAT gateway needs the internet gateway to reach the internet
  depends_on = [aws_internet_gateway.main]
}

# --- Private tier (EKS nodes and pods) -------------------------------------------------------------
resource "aws_subnet" "private" {
  count = var.az_count

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.private_subnet_cidrs[count.index]

  tags = {
    Name = "${var.project}-private-${local.azs[count.index]}"
    # Internal (VPC-only) load balancers go here, if any are ever created
    "kubernetes.io/role/internal-elb" = "1"
    # Lets Karpenter (node autoscaler, EKS step) find the subnets to launch nodes into
    "karpenter.sh/discovery" = local.cluster_name
  }
}

# One route table per AZ, so with one NAT per AZ each subnet uses the NAT in its own AZ
resource "aws_route_table" "private" {
  count = var.az_count

  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    # Single NAT: everyone uses NAT 0. One per AZ: subnet i uses NAT i.
    nat_gateway_id = aws_nat_gateway.main[var.single_nat_gateway ? 0 : count.index].id
  }

  tags = {
    Name = "${var.project}-private-${local.azs[count.index]}"
  }
}

resource "aws_route_table_association" "private" {
  count = var.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# --- Database tier ---------------------------------------------------------------------------------
# No route to the internet in either direction. RDS only needs to be reachable from inside the VPC;
# security groups (RDS step) narrow that down to the EKS nodes.
resource "aws_subnet" "database" {
  count = var.az_count

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = local.database_subnet_cidrs[count.index]

  tags = {
    Name = "${var.project}-database-${local.azs[count.index]}"
  }
}

resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id
  # Only the implicit "local" route (VPC to VPC); no 0.0.0.0/0

  tags = {
    Name = "${var.project}-database"
  }
}

resource "aws_route_table_association" "database" {
  count = var.az_count

  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# --- S3 gateway endpoint (free) --------------------------------------------------------------------
# Sends S3 traffic from private subnets directly to S3 instead of through the NAT gateway. ECR stores
# image layers in S3, so every image pull would otherwise pay NAT data charges.
# (Interface endpoints for ECR, STS, Secrets Manager, etc. are NOT free: about USD 0.013/hour per AZ
# EACH, which adds up to more than the NAT gateway. And Kafka/Debezium images come from public
# registries, so a NAT gateway is needed anyway.)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = {
    Name = "${var.project}-s3"
  }
}
