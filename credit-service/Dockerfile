# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
#  2026-09-26: Recess iteration - multi-stage image, following user-service/Dockerfile
#    (same node:24-alpine base and dev/prod target names).
#    No requirements, architecture, schema, or API decisions were made by the AI tool.
#    Author review: Wee Jean
#  2026-11-06: Tool: Claude Code (model: claude-opus-5-5). ECS Fargate migration - add the RDS CA
#    bundle to the prod stage, per George's ECS Fargate plan, Phase 1 item 4.
#    No requirements, architecture, schema, or API decisions were made by the AI tool.
#    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3003

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm run build
# Trusted through NODE_EXTRA_CA_CERTS, set in the ECS task definition.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem /etc/ssl/rds-ap-southeast-1-bundle.pem
CMD ["node", "dist/server.js"]
