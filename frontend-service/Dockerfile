# syntax=docker/dockerfile:1

FROM node:26.10.0-alpine3.24 AS base
WORKDIR /app
RUN npm install -g corepack@0.36.0 && corepack enable

FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL=https://raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images
ENV NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL=$NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL
RUN mkdir -p public && yarn build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
