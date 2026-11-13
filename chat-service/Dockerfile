# AI-assisted (Claude), reviewed and tested by Maliha
# chat-service doesn't use shared/, so it builds from its own folder.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY schema.sql ./
USER node
EXPOSE 3005
CMD ["node", "dist/index.js"]