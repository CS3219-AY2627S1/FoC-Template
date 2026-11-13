#!/bin/bash
# Write the local CA and User Service certificate that Compose mounts.
# Same material as scripts/generate-dev-tls.ps1. Safe to refuse if files exist.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/certs"
force=0
if [[ "${1:-}" == "--force" ]]; then
  force=1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required." >&2
  exit 1
fi

mkdir -p "$dir"

ca_key="$dir/ca.key"
ca_crt="$dir/ca.crt"
server_key="$dir/user-service.key"
server_crt="$dir/user-service.crt"
server_csr="$dir/user-service.csr"
serial="$dir/ca.srl"

if [[ "$force" -eq 0 ]]; then
  for existing in "$ca_key" "$ca_crt" "$server_key" "$server_crt"; do
    if [[ -f "$existing" ]]; then
      echo "Development certificates already exist. Re-run with --force to replace them." >&2
      exit 1
    fi
  done
fi

extensions="$(mktemp)"
trap 'rm -f "$extensions"' EXIT

cat >"$extensions" <<'EOF'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=user-service
DNS.2=localhost
IP.1=127.0.0.1
EOF

openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
  -keyout "$ca_key" -out "$ca_crt" -subj "/CN=FoC Development CA"
openssl req -new -newkey rsa:2048 -sha256 -nodes \
  -keyout "$server_key" -out "$server_csr" -subj "/CN=user-service"
openssl x509 -req -sha256 -days 825 -in "$server_csr" \
  -CA "$ca_crt" -CAkey "$ca_key" -CAcreateserial \
  -out "$server_crt" -extfile "$extensions"

rm -f "$server_csr" "$serial"
echo "Created development TLS material in $dir."
echo "The private keys and certificates are ignored by Git."
