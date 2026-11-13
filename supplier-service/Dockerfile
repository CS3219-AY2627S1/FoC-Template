FROM denoland/deno:latest AS deps
ENV DENO_DIR=/deno-dir
WORKDIR /app

# only rebuild if deps change
COPY deno.json deno.lock package.json* ./
RUN deno ci

# dev env
FROM deps AS development
WORKDIR /app
# COPY . .
CMD ["deno", "task", "dev"]

# production env
FROM denoland/deno:latest AS production
ENV DENO_DIR=/deno-dir
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /deno-dir /deno-dir
COPY . .

RUN deno task build
CMD ["deno", "run", "-A", "src/index.ts"]
