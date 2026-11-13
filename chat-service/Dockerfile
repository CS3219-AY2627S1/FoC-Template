FROM denoland/deno:latest AS deps
ENV DENO_DIR=/deno-dir
WORKDIR /app

# only rebuild if deps change
COPY deno.json deno.lock package.json* ./
RUN deno ci

# dev env
FROM deps AS development
WORKDIR /app
EXPOSE 3000
CMD ["deno", "task", "dev"]

# production env
FROM denoland/deno:latest AS production
ENV DENO_DIR=/deno-dir
WORKDIR /app

COPY --from=deps /deno-dir /deno-dir
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/global-bundle.pem

# type check the whole service ("deno task build" = deno check src/index.ts)
RUN deno task build
EXPOSE 3000
CMD ["deno", "run", "-A", "src/index.ts"]
