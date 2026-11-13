FROM denoland/deno:latest AS base
ENV DENO_DIR=/deno-dir
WORKDIR /app
COPY deno.json deno.lock package.json ./
RUN deno ci
COPY . .

FROM base AS development
CMD ["deno", "run", "-A", "--watch", "src/index.ts"]

FROM base AS production
RUN deno check src/index.ts
CMD ["deno", "run", "-A", "src/index.ts"]
