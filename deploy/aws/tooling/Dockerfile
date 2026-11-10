# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented the Node/Docker CLI tooling image used by database provisioning.
# Author review: I validated correctness and added boundary checks where needed.

FROM docker:29-cli AS docker-cli

FROM node:22-bookworm

# Supabase CLI invokes the Docker executable as well as accessing its socket.
# Copy only the client; all containers still run on the host's existing daemon.
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

