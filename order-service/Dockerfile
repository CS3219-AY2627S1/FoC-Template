# Order service image, same stage layout as the user and supplier services:
#   deps        - installs packages and generates the Prisma client
#   development - used by compose, which mounts the source code into /app
#   production  - source code copied into the image
FROM denoland/deno:latest AS deps
ENV DENO_DIR=/deno-dir
WORKDIR /app

# Prisma 5's query engine needs OpenSSL, which the Deno image doesn't include
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# only reinstall when the dependencies or the schema change
COPY deno.json package.json ./
COPY src/prisma/schema.prisma ./src/prisma/
RUN deno install
# the classic Prisma client must be generated for this (Linux) machine
RUN deno run -A npm:prisma@5.22.0 generate --schema src/prisma/schema.prisma

# dev env
FROM deps AS development
WORKDIR /app
# Deno.serve listens on port 8000 by default
EXPOSE 8000
CMD ["deno", "task", "dev"]

# production env
FROM deps AS production
WORKDIR /app
COPY . .
EXPOSE 8000
CMD ["deno", "run", "-A", "src/server.ts"]
