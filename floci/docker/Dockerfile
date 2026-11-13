# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
# Scope: Generated implementation of local Compose Floci image and infrastructure bootstrap
# Author review: Verified correctness.

FROM floci/floci:latest-compat
USER root
RUN microdnf install -y jq && microdnf clean all
USER 1001
COPY --chmod=755 floci/common/init.sh /etc/floci/init/ready.d/01-init.sh
COPY infra/relay-auth.yaml infra/relay-storage.yaml infra/relay-floci-db.yaml /opt/relay/infra/
