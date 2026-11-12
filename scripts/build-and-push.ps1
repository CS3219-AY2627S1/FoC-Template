# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

<#
.SYNOPSIS
  Builds the backend service images, pushes them to ECR, and points the Kubernetes manifests at them.

.DESCRIPTION
  1. Tag = the current git commit (short SHA). ECR tags are immutable, so a tag always means one image.
  2. docker build --platform linux/amd64 (the EKS nodes are x86_64), then docker push.
  3. Updates newName/newTag under `images:` in k8s/kustomization.yaml and k8s/jobs/kustomization.yaml.
     Commit that change: the manifests in git then say exactly which images are deployed.

  Needs: Docker Desktop running (it includes docker-credential-ecr-login), AWS CLI signed in
  (aws sso login, with AWS_PROFILE set), and the ECR repositories from terraform/infra.
  On first run it registers the ECR credential helper for your registry in ~/.docker/config.json.

.EXAMPLE
  ./scripts/build-and-push.ps1                              # all services
  ./scripts/build-and-push.ps1 -Services order-service      # just one
  ./scripts/build-and-push.ps1 -Services user-service,credit-service   # several (no spaces needed)
  ./scripts/build-and-push.ps1 -AllowDirty                  # uncommitted changes allowed (tag gets a -dirty suffix)
#>
# PositionalBinding off: a stray argument is an error, instead of silently becoming -Region/-Project
[CmdletBinding(PositionalBinding = $false)]
param(
  [string[]]$Services = @("user-service", "supplier-service", "credit-service", "order-service", "notification-service", "chat-service", "ai-errand-assistant-service", "rag-service"),
  [ValidatePattern("^[a-z]{2}(-[a-z]+)+-\d$")]
  [string]$Region = "ap-southeast-1",
  [string]$Project = "campuscouriers",
  [switch]$AllowDirty,
  [switch]$NoManifestUpdate
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

# Accept "-Services a,b" and "-Services a, b" alike: under `powershell -File` a comma list arrives
# as one string (or several), not as an array
$allServices = @("user-service", "supplier-service", "credit-service", "order-service", "notification-service", "chat-service", "ai-errand-assistant-service", "rag-service")
$Services = @($Services | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$unknown = @($Services | Where-Object { $allServices -notcontains $_ })

# Image names are lowercase; a service whose folder is named differently is listed here
$folders = @{ "rag-service" = "RAG-service" }
function Get-Folder([string]$service) { if ($folders.ContainsKey($service)) { $folders[$service] } else { $service } }
if ($unknown.Count) { throw "Unknown service(s): $($unknown -join ', '). Choose from: $($allServices -join ', ')" }

function Invoke-Native([scriptblock]$Command, [string]$What) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

# Runs a native command whose failure is an expected answer (e.g. "image not found").
# Windows PowerShell 5.1 turns redirected stderr into terminating errors under "Stop", so relax it here.
function Test-Native([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Command 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }
  finally { $ErrorActionPreference = $previous }
}

# --- Tag: the git commit ---------------------------------------------------------------------------
$sha = (git -C $root rev-parse --short=12 HEAD).Trim()
$dirty = git -C $root status --porcelain -- @($Services | ForEach-Object { Get-Folder $_ })
if ($dirty) {
  if (-not $AllowDirty) {
    throw "Uncommitted changes in $($Services -join ', '). Commit them first (so the tag matches the code), or pass -AllowDirty."
  }
  $tag = "$sha-dirty-$(Get-Date -Format yyyyMMddHHmmss)"
  Write-Warning "Building uncommitted changes as $tag"
} else {
  $tag = $sha
}

# --- Registry login --------------------------------------------------------------------------------
$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0) { throw "AWS CLI is not signed in. Run: aws sso login" }
$registry = "$account.dkr.ecr.$Region.amazonaws.com"

# Docker authenticates to ECR through Amazon's credential helper (shipped with Docker Desktop as
# docker-credential-ecr-login): on every push it creates a fresh token from your AWS login.
# Why not `aws ecr get-login-password | docker login`? On Windows that breaks twice:
#   - Windows PowerShell pipes text into programs with a byte-order mark in front -> 400 Bad Request
#   - the ECR token (~3 KB) is too big for Windows Credential Manager -> "The stub received bad data"
# Registering the helper for THIS registry only leaves every other registry as it was.
$dockerConfigPath = Join-Path $HOME ".docker\config.json"
$dockerConfig = if (Test-Path $dockerConfigPath) { Get-Content $dockerConfigPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
if (-not $dockerConfig.credHelpers) {
  $dockerConfig | Add-Member -NotePropertyName credHelpers -NotePropertyValue ([pscustomobject]@{}) -Force
}
if ($dockerConfig.credHelpers.$registry -ne "ecr-login") {
  if (Test-Path $dockerConfigPath) { Copy-Item $dockerConfigPath "$dockerConfigPath.bak" -Force }
  $dockerConfig.credHelpers | Add-Member -NotePropertyName $registry -NotePropertyValue "ecr-login" -Force
  [IO.File]::WriteAllText($dockerConfigPath, ($dockerConfig | ConvertTo-Json -Depth 20)) # UTF-8, no BOM
  Write-Host "Registered the ECR credential helper for $registry in $dockerConfigPath (backup: config.json.bak)"
}

# --- Build and push --------------------------------------------------------------------------------
foreach ($service in $Services) {
  $repository = "$Project/$service"
  $image = "${registry}/${repository}:$tag"

  if (Test-Native { aws ecr describe-images --region $Region --repository-name $repository --image-ids "imageTag=$tag" }) {
    Write-Host "== $image already in ECR (tags are immutable), skipping" -ForegroundColor Yellow
    continue
  }

  Write-Host "== Building $image" -ForegroundColor Cyan
  # --provenance/--sbom=false: push one plain image. By default Docker Desktop wraps the image in an
  # index with an attestation, leaving the real image untagged: ECR then skips its vulnerability scan,
  # and the "delete untagged images" cleanup rule (ecr.tf) could remove an image still in use.
  Invoke-Native {
    docker build --platform linux/amd64 --provenance=false --sbom=false `
      --label "org.opencontainers.image.revision=$sha" `
      --label "org.opencontainers.image.source=https://github.com/AY2627S1-CS3219-P14" `
      -t $image (Join-Path $root (Get-Folder $service))
  } "docker build ($service)"

  Write-Host "== Pushing $image" -ForegroundColor Cyan
  Invoke-Native { docker push $image } "docker push ($service)"
}

# --- Point the manifests at the new images ---------------------------------------------------------
if (-not $NoManifestUpdate) {
  foreach ($file in "k8s/kustomization.yaml", "k8s/jobs/kustomization.yaml") {
    $path = Join-Path $root $file
    $text = [IO.File]::ReadAllText($path)
    foreach ($service in $Services) {
      # - name: campuscouriers/<service>
      #   newName: <anything>        -> <registry>/campuscouriers/<service>
      #   newTag: <anything>         -> <tag>
      $pattern = "(- name: $Project/$service\r?\n\s+newName: )\S+(\r?\n\s+newTag: )\S+"
      $text = [regex]::Replace($text, $pattern, "`${1}$registry/$Project/$service`${2}$tag")
    }
    [IO.File]::WriteAllText($path, $text) # UTF-8 without BOM
  }
  Write-Host "Updated image tags in k8s/kustomization.yaml and k8s/jobs/kustomization.yaml" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done: tag $tag" -ForegroundColor Green
Write-Host "Next: review and commit the kustomization changes, then deploy (k8s/README.md)."
