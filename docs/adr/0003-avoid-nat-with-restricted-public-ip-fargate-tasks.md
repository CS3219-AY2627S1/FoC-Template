---
status: accepted
---

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-10-18
Scope: Recorded the network cost and exposure trade-off explicitly approved by @ron for
GitHub issue #44. No AWS resources were created.
Author review: Decision reviewed and approved by @ron on 2026-10-18; final wording remains
subject to pull-request review.
-->

# Avoid NAT with restricted public-IP Fargate tasks

Run Fargate tasks in public subnets with assigned public IPs so they can pull images and
publish telemetry without a NAT Gateway or several paid interface endpoints. Security
groups allow no direct internet ingress: the frontend accepts traffic only from the
internal ALB, and backend services accept traffic only from the approved service security
groups. The ALB and RDS remain private, and CloudFront reaches the ALB through a VPC origin.

This is a cost-conscious demo decision, not a production default. Reconsider private task
subnets with NAT or VPC endpoints before the system handles real personal or confidential
data, or when the account budget can support the additional fixed cost.
