name_prefix = "foc-prod"

image_bucket_names = {
  user     = "foc-prod-user"
  supplier = "foc-prod-supplier"
  order    = "foc-prod-order"
}

domain_name        = "cs3219-p24.mooo.com"
acme_email         = "kristupas.arifovas@gmail.com"
mail_from          = "kristupas.arifovas@gmail.com"
start_services     = true
core_ami_id        = "ami-0bc28c835804b16d5"
core_instance_type = "t3a.medium"
db_instance_class  = "db.t4g.micro"

grafana_cloudwatch_reader = {
  account_id  = "008923505280"
  external_id = "1887369"
}
