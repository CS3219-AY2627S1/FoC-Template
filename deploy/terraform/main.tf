# One EC2 instance with k3s in its own small network. No NAT gateway and no load balancer:
# the instance has a fixed public address, and Traefik inside k3s answers on ports 80 and 443.

data "aws_ssm_parameter" "ubuntu" {
  # Ubuntu 22.04: its kernel is older than 6.19, which mongo:8 refuses to start on.
  name = "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id"
}

# The address this laptop reaches the internet from, so only you can reach SSH and the API.
data "http" "my_ip" {
  url = "https://checkip.amazonaws.com"
}

locals {
  admin_cidrs = length(var.admin_cidrs) > 0 ? var.admin_cidrs : ["${chomp(data.http.my_ip.response_body)}/32"]
  # sslip.io turns a name like relay.1-2-3-4.sslip.io into 1.2.3.4, so there is no domain to buy.
  hostname = "relay.${replace(aws_eip.relay.public_ip, ".", "-")}.sslip.io"
}

resource "aws_vpc" "relay" {
  # Not 10.42.0.0/16 or 10.43.0.0/16: k3s uses those for pods and services.
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags                 = { Name = "relay" }
}

resource "aws_internet_gateway" "relay" {
  vpc_id = aws_vpc.relay.id
  tags   = { Name = "relay" }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.relay.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.region}a"
  # Gives the instance internet access on its first boot, before the Elastic IP is attached.
  map_public_ip_on_launch = true
  tags                    = { Name = "relay-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.relay.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.relay.id
  }

  tags = { Name = "relay-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "relay" {
  name        = "relay"
  description = "Web traffic from everywhere, SSH and the Kubernetes API only from the admins"
  vpc_id      = aws_vpc.relay.id

  ingress {
    description = "HTTP, also for the Lets Encrypt check"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = local.admin_cidrs
  }

  ingress {
    description = "Kubernetes API for kubectl and helm"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = local.admin_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "relay" }
}

resource "aws_key_pair" "relay" {
  key_name   = "relay"
  public_key = file(pathexpand(var.ssh_public_key))
}

# A fixed address that stays the same when the instance is stopped and started again,
# so the URL and the HTTPS certificate keep working.
resource "aws_eip" "relay" {
  domain = "vpc"
  tags   = { Name = "relay" }
}

resource "aws_instance" "relay" {
  ami                    = data.aws_ssm_parameter.ubuntu.insecure_value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.relay.id]
  key_name               = aws_key_pair.relay.key_name
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  root_block_device {
    volume_size = 40
    volume_type = "gp3"
  }

  metadata_options {
    http_tokens = "required"
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    public_ip   = aws_eip.relay.public_ip
    k3s_version = var.k3s_version
  })
  user_data_replace_on_change = true

  # A newer Ubuntu image must not replace the running machine and its data.
  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = "relay" }
}

resource "aws_eip_association" "relay" {
  instance_id   = aws_instance.relay.id
  allocation_id = aws_eip.relay.id
}
