#!/usr/bin/env sh
set -eu

mkdir -p "${CERT_DIR}"

echo "Generating self-signed TLS certificate for ${DOMAIN}..."
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "${CERT_DIR}/privkey.pem" \
  -out "${CERT_DIR}/fullchain.pem" \
  -subj "/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1"

chmod 644 "${CERT_DIR}/fullchain.pem"
chmod 600 "${CERT_DIR}/privkey.pem"

echo "Wrote ${CERT_DIR}/fullchain.pem and ${CERT_DIR}/privkey.pem"
