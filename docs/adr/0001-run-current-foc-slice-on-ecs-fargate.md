---
status: accepted
---

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-10-18
Scope: Recorded the runtime architecture trade-off explicitly approved by @ron for
GitHub issue #44. No AWS resources were created.
Author review: Decision reviewed and approved by @ron on 2026-10-18; final wording remains
subject to pull-request review.
-->

# Run the current FoC slice on ECS Fargate behind CloudFront and nginx

Deploy the React/nginx frontend, User Service, and Supplier Service as independent ECS
Fargate services. CloudFront provides the generated HTTPS entry point and privately reaches
an internal Application Load Balancer; the ALB targets nginx, which retains the existing
same-origin API routing. ECS Service Connect preserves `user-service:3001` and
`supplier-service:3000` for internal traffic. This avoids EC2 host administration and an
unnecessary Kubernetes control plane while preserving the application contracts already
tested in Compose.

The team accepts that nginx remains in the API request path and that the generated
CloudFront hostname is less friendly than a custom domain. Order and Credit are not
provisioned now; they can later join the same cluster and service namespace.
