terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
    http = {
      source  = "hashicorp/http"
      version = ">= 3.4"
    }
  }
}

# Credentials come from the AWS CLI profile (AWS_PROFILE=relay, see docs/deployment.md).
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = "relay"
    }
  }
}
