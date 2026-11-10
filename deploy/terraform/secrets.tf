# Only containers are managed here. Populate JSON values outside Terraform;
# do not add aws_secretsmanager_secret_version or read secret values as data.
resource "aws_secretsmanager_secret" "service" {
  for_each                = local.backend_names
  name                    = "${var.project_name}/${each.key}"
  description             = "Deployment-only ${each.key} environment JSON, populated outside Terraform"
  recovery_window_in_days = 7
}
