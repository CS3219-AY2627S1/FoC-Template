# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

<#
.SYNOPSIS
  Builds the frontend and publishes it to S3 + CloudFront (https://app.<domain>).

.DESCRIPTION
  1. Builds with pnpm, baking the API address into the code. Vite reads VITE_* variables at BUILD
     time, so changing the API address means rebuilding. Values set here override the repo's .env.
  2. Uploads to the S3 bucket with caching rules:
       assets/*   file names contain a content hash (index-3f2a91c.js), so they never change:
                  browsers and CloudFront may keep them for a year
       the rest   index.html etc.: "no-cache" = always check for a newer version, so a deploy
                  shows up on the next page load
     Assets go up first, index.html last, so a visitor never gets an index.html pointing at files
     that aren't uploaded yet. Old assets are kept for visitors still running the previous version.
  3. Clears CloudFront's cache so the new index.html is served immediately.

  Needs: Node.js (pnpm comes via corepack), AWS CLI signed in, terraform/infra applied.

.EXAMPLE
  ./scripts/deploy-frontend.ps1
  ./scripts/deploy-frontend.ps1 -BuildOnly      # build with the production settings, upload nothing
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path $root "frontend"
$infra = Join-Path $root "terraform\infra"

function Invoke-Native([scriptblock]$Command, [string]$What) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

# --- Where things are (from Terraform) -------------------------------------------------------------
$outputs = terraform "-chdir=$infra" output -json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $outputs.frontend_bucket) {
  throw "Couldn't read terraform outputs. Is AWS_PROFILE set, are you logged in, and is terraform/infra applied?"
}
$apiUrl = $outputs.api_url.value
$bucket = $outputs.frontend_bucket.value
$distribution = $outputs.frontend_distribution_id.value
Write-Host "API: $apiUrl  ->  bucket: $bucket, CloudFront: $distribution"

if (git -C $root status --porcelain -- frontend) {
  Write-Warning "frontend/ has uncommitted changes; they will be included in this deploy"
}

# --- Build -----------------------------------------------------------------------------------------
$env:VITE_USER_API_URL = $apiUrl
$env:VITE_SUPPLIER_API_URL = $apiUrl
$env:VITE_ORDER_API_URL = $apiUrl
$env:VITE_CREDIT_API_URL = $apiUrl
$env:VITE_NOTIFICATION_API_URL = $apiUrl
$env:VITE_AI_ASSISTANT_API_URL = $apiUrl
$env:VITE_RAG_API_URL = $apiUrl
$env:VITE_CHAT_API_URL = $apiUrl # the chat WebSocket becomes wss://<same host>/conversations/{id}/ws
$env:VITE_MOCK_AUTH = "false"

Push-Location $frontend
try {
  Invoke-Native { corepack pnpm install --frozen-lockfile } "pnpm install"
  Invoke-Native { corepack pnpm build } "pnpm build"
} finally {
  Pop-Location
}
$dist = Join-Path $frontend "dist"
Write-Host "Built $dist" -ForegroundColor Green
if ($BuildOnly) { return }

# --- Upload ----------------------------------------------------------------------------------------
Write-Host "== Uploading hashed assets (cached for a year)" -ForegroundColor Cyan
Invoke-Native {
  aws s3 sync (Join-Path $dist "assets") "s3://$bucket/assets" --cache-control "public, max-age=31536000, immutable"
} "upload assets"

Write-Host "== Uploading index.html and other files (always revalidated)" -ForegroundColor Cyan
Invoke-Native {
  aws s3 sync $dist "s3://$bucket" --exclude "assets/*" --cache-control "no-cache" --delete
} "upload index.html"

# --- Clear the CloudFront cache --------------------------------------------------------------------
# "/*" counts as one path; the first 1,000 paths per month are free
$invalidation = aws cloudfront create-invalidation --distribution-id $distribution --paths "/*" --query Invalidation.Id --output text
if ($LASTEXITCODE -ne 0) { throw "CloudFront invalidation failed" }
Write-Host "Cache cleared (invalidation $invalidation, takes ~1 minute)"

Write-Host ""
Write-Host "Done: $($outputs.frontend_url.value)" -ForegroundColor Green
