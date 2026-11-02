# syntax=docker/dockerfile:1
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-10-13
# Mode: Implementation and configuration.
# Scope: Updated the local Firebase emulator image for Storage emulator support.
# Author review: I reviewed for correctness.

# Local-only Firebase Auth + Firestore emulators for compose.yaml. Never deployed.
FROM node:24-slim

# The emulators need a Java 21+ runtime.
COPY --from=eclipse-temurin:21-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:$PATH \
    FIREBASE_PROJECT=demo-foc

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g firebase-tools@15.31.0 --no-audit --no-fund \
 && firebase setup:emulators:firestore \
 && firebase setup:emulators:ui

WORKDIR /srv/firebase
COPY firebase.json .

EXPOSE 4000 4400 8090 9099 9199
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=10 \
  CMD curl -fs http://127.0.0.1:4400/emulators >/dev/null || exit 1

# `demo-*` projects never reach real Firebase services. Data persists in the /data
# volume between restarts (import on start, export on shutdown via SIGINT).
# Export into a subfolder: /data is the volume mount point and cannot be replaced.
CMD ["sh", "-c", "IMPORT=; [ -f /data/export/firebase-export-metadata.json ] && IMPORT=--import=/data/export; exec firebase emulators:start --project \"$FIREBASE_PROJECT\" $IMPORT --export-on-exit=/data/export"]
