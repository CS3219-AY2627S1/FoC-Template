# AI Assistance Disclosure:
# Tool: Claude Code (claude-sonnet-5), date: 2026-09-24
#   24/09/2026: Stage 3a - multi-stage Dockerfile (dev + prod)
#   Author review: No changes needed. 
#   26/09/2026: Stage 7 - prod CMD runs dist/server.js (app.ts no longer starts the server)
#   Author review:
#   2026-11-06: Tool: Claude Code (model: claude-opus-5-5). ECS Fargate migration - add the RDS CA
#     bundle to the prod stage, per George's ECS Fargate plan, Phase 1 item 4. No requirements,
#     architecture, schema, or API decisions were made by the AI tool.
#   Author review: George Yeo

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3001

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm run build
# Trusted through NODE_EXTRA_CA_CERTS, set in the ECS task definition.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem /etc/ssl/rds-ap-southeast-1-bundle.pem
CMD ["node", "dist/server.js"]
