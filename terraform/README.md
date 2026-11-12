# Terraform (AWS)

```text
terraform/
├── bootstrap/   # run ONCE: creates the S3 state bucket and a cost alert. Local state.
└── infra/       # everything else (VPC, EKS, RDS, ...), added step by step. State in S3.
```

## 1. Install the tools (each teammate)

```powershell
winget install Hashicorp.Terraform
winget install Amazon.AWSCLI
# open a new terminal, then check:
terraform version   # needs 1.11 or newer
aws --version
```

## 2. Sign in to AWS

### How Terraform gets credentials
The AWS provider looks for credentials in the same places as the AWS CLI, in this order:
1. Environment variables (`AWS_ACCESS_KEY_ID`, ...): used by CI.
2. The profile named by `AWS_PROFILE` in `~/.aws/config`: **what we use**.
3. Instance/container roles: used when running inside AWS.

So credentials are **never** written in `.tf` files. Terraform uses whoever is signed in on the terminal.

### One-time account setup (account owner)
1. **Lock away the root user.** Turn on MFA for the root login (the email you signed up with), then stop using it day to day.
2. **Turn on IAM Identity Center** (console → IAM Identity Center → Enable), in `ap-southeast-1`.
3. Create a **user** for each teammate, plus a **group** `campuscouriers-admins` containing them.
4. Create a **permission set** using the `AdministratorAccess` managed policy. Assign the group to your AWS account with that permission set.
5. Note the **AWS access portal URL** (`https://d-xxxxxxxxxx.awsapps.com/start`) and send it to the team.

Why Identity Center instead of IAM users with access keys: each login gives short-lived credentials (hours) that expire on their own. A leaked access key keeps working until someone notices and deletes it.

### Each teammate, on their machine
```powershell
aws configure sso
#   SSO session name:    campuscouriers
#   SSO start URL:       <access portal URL>
#   SSO region:          ap-southeast-1
#   scopes:              (press Enter)
#   -> a browser opens: log in, approve
#   pick the account and AdministratorAccess role
#   default region:      ap-southeast-1
#   output format:       json
#   profile name:        campuscouriers

$env:AWS_PROFILE = "campuscouriers"         # this terminal only
setx AWS_PROFILE campuscouriers             # optional: every NEW terminal from now on

aws sts get-caller-identity                 # should show .../AWSReservedSSO_AdministratorAccess_.../<you>
```

When the session expires (after about 8 hours by default), run `aws sso login` again. Terraform errors like *"token has expired"* or *"no valid credential sources"* mean exactly this.

## 3. Why keep state in S3

Terraform's **state** maps each resource in the code to the real thing in AWS (this `aws_db_instance` is database `db-ABC123`). Without it, Terraform would try to create everything again.

By default it's a local file, `terraform.tfstate`. For a team that breaks down quickly:

| Local file | S3 backend |
| --- | --- |
| Only on one laptop; teammates can't run Terraform | One shared copy |
| Two people applying at once corrupt it | Locked while someone is applying (`use_lockfile`) |
| Lost laptop = Terraform loses track of everything | Versioned: any old copy can be restored |
| Tempting to commit to git, but it can contain secrets | Encrypted, private, never in git |

The bucket costs a few cents a month. Older tutorials also create a DynamoDB table for locking: that's no longer needed since Terraform 1.11, which locks with a file in the same bucket.

**The chicken-and-egg problem:** Terraform needs the bucket to store state, but the bucket is created by Terraform. So `bootstrap/` creates the bucket and keeps its own small state locally. Everything else (`infra/`) then stores its state in that bucket.

## 4. Create the state bucket (once, by one person)

```powershell
cd terraform/bootstrap
copy terraform.tfvars.example terraform.tfvars   # fill in account id + your email
terraform init       # downloads the AWS provider
terraform plan       # preview: 7 resources to add (bucket + settings, budget)
terraform apply      # type "yes"
terraform output -raw backend_hcl
```

- AWS emails the budget address to confirm alerts. Click the link.
- `bootstrap/terraform.tfstate` stays on that laptop, and is git-ignored. If it's ever lost, nothing breaks. The bucket keeps working, and `terraform import` can rebuild the file if the bootstrap ever needs changing.

## 5. Connect the main stack to S3

```powershell
cd ../infra
# paste the backend_hcl output into backend.hcl, then:
copy terraform.tfvars.example terraform.tfvars   # fill in account id
terraform init -backend-config="backend.hcl"
terraform apply      # creates nothing yet; prints who you're signed in as
```

Commit `backend.hcl`, `terraform.tfvars` and `.terraform.lock.hcl`. None of them are secret, and teammates need the same values. After pulling, a teammate only runs `terraform init -backend-config="backend.hcl"`.

Check in the S3 console: the bucket now has `campuscouriers/infra.tfstate`.

## Everyday commands

```powershell
terraform fmt -recursive   # format files
terraform validate         # catch typos without touching AWS
terraform plan             # ALWAYS read this before applying
terraform apply
terraform destroy          # tear down infra/ when not demoing (EKS bills hourly); see "Tearing down"
```

## What's in `infra/`

| File | Creates |
| --- | --- |
| `vpc.tf` | VPC, public/private/database subnets in 2 AZs, NAT gateway, S3 endpoint |
| `eks.tf` | EKS cluster, worker nodes, managed add-ons (networking, DNS, metrics-server, EBS disks) |
| `irsa.tf` | OIDC provider + trust policies that let specific pods use specific IAM roles |
| `load-balancer-controller.tf` | AWS Load Balancer Controller (Ingress → ALB) |
| `external-secrets.tf` | External Secrets Operator + the Secrets Manager secrets it reads |
| `rds.tf` | PostgreSQL instance in the database subnets, its firewall, generated per-service DB passwords |
| `ecr.tf` | One private image repository per service (immutable git-SHA tags, scan on push, cleanup rules). Push with `scripts/build-and-push.ps1`. |
| `external-dns.tf` | external-dns: creates the `api.<domain>` DNS record pointing at the ALB, from the Ingress host |
| `frontend.tf` | Private S3 bucket + CloudFront at `https://app.<domain>` (certificate in us-east-1, as CloudFront requires). Publish with `scripts/deploy-frontend.ps1`. |

`bootstrap/dns.tf` holds the domain's Route 53 hosted zone and the API's ACM certificate. They live in bootstrap, not `infra/`, so destroying `infra/` doesn't change your nameservers.

## Domain

The domain is bought outside AWS (this sandbox blocks buying domains through Route 53). One-time setup:

1. **`terraform/bootstrap/terraform.tfvars`**: add `domain_name = "yourdomain.com"`, then in `terraform/bootstrap` run `terraform apply` (creates the hosted zone, the certificate and its validation record).
2. **At your registrar**: replace the domain's nameservers with the four from `terraform output name_servers` (in `terraform/bootstrap`).
3. **Wait** until the certificate is issued (minutes, sometimes a few hours while DNS spreads):
   `aws acm describe-certificate --certificate-arn (terraform output -raw api_certificate_arn) --query Certificate.Status` → `ISSUED`.
   If it's still `PENDING_VALIDATION` after 72 hours, ACM gives up: check the nameservers, then `terraform apply -replace=aws_acm_certificate.api`.
4. **`terraform/infra/terraform.tfvars`**: set `domain_name` to the same value, then `terraform apply` in `terraform/infra` (installs external-dns).
5. **`k8s/domain.yaml`**: set `apiHost` and `appOrigin`, then `kubectl apply -k k8s`. The ALB gets HTTPS with that certificate, and external-dns creates `api.<domain>` within a minute or two.

**NUS sandbox restrictions** (the account's organization policy blocks these, whatever IAM allows): EKS Pod Identity (so pods use IRSA instead), AWS Shield, WAF Classic, and buying domains through Route 53. Before adding anything that needs new AWS permissions, check it with the policy simulator, which includes the organization's rules:

```powershell
aws iam simulate-principal-policy --policy-source-arn <your SSO role ARN> --action-names <service:Action> ... `
  --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output table
```

## Secrets

All secrets live in Secrets Manager under `campuscouriers/`. External Secrets Operator copies them into the cluster (`k8s/*/external-secrets.yaml`). None of their values are in the Terraform state file:

| Secret | Value comes from |
| --- | --- |
| `campuscouriers/db/<service>-service` | Generated by Terraform as an *ephemeral* value and sent as *write-only*, so it never reaches the state. To rotate: bump `secret_string_wo_version` in `rds.tf`, apply, re-run db-init (`k8s/ops`), restart the service. |
| RDS master (`rds!db-...`) | Generated, stored and rotated every 7 days by RDS itself. |
| `campuscouriers/db/connection` | Terraform (endpoint only; not secret). |
| `campuscouriers/user-service-jwt`, `campuscouriers/user-bootstrap-admin` | You, once, with the commands below. |

```powershell
# JWT signing keys: generate a NEW pair for AWS (don't reuse the local dev keys in user-service/keys)
$openssl = "C:\Program Files\Git\usr\bin\openssl.exe"
& $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem   # PKCS#8, as user-service expects
& $openssl pkey -in private.pem -pubout -out public.pem
# ReadAllText, not Get-Content: in Windows PowerShell 5.1, Get-Content attaches hidden properties
# (PSPath, ...) that ConvertTo-Json writes out, producing {"value": "-----BEGIN...", "PSPath": ...}
@{ "private.pem" = [IO.File]::ReadAllText("$PWD\private.pem"); "public.pem" = [IO.File]::ReadAllText("$PWD\public.pem") } |
  ConvertTo-Json | Set-Content jwt.json -Encoding ascii
aws secretsmanager put-secret-value --secret-id campuscouriers/user-service-jwt --secret-string file://jwt.json
Remove-Item jwt.json, private.pem, public.pem   # the only copy now lives in Secrets Manager

# First administrator
@{ BOOTSTRAP_ADMIN_NAME = "<name>"; BOOTSTRAP_ADMIN_EMAIL = "<email>"; BOOTSTRAP_ADMIN_PASSWORD = "<password>" } |
  ConvertTo-Json | Set-Content admin.json -Encoding ascii
aws secretsmanager put-secret-value --secret-id campuscouriers/user-bootstrap-admin --secret-string file://admin.json
Remove-Item admin.json
```

(The JSON goes through a file because Windows PowerShell 5.1 mangles quotes when passing JSON directly to `aws`.)

## Tearing down

The Load Balancer Controller deletes an ALB only while it is running. If Terraform removes the controller first, the ALB (and its security groups) stay behind and block deleting the VPC. So:

```powershell
kubectl delete -k k8s     # removes the Ingress -> the controller deletes the ALB (give it a minute)
cd terraform/infra; terraform destroy
```