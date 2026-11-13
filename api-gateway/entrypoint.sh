#!/bin/sh

# all system dns servers to use for nginx dynamic dns resolution
RESOLVER_IP=$(awk '($1 == "nameserver") {print $2; exit}' /etc/resolv.conf)

# fallback to docker dns resolution
if [ -z "$RESOLVER_IP" ]; then
    RESOLVER_IP="127.0.0.11"
fi

echo "resolver $RESOLVER_IP valid=10s ipv6=off;" > /etc/nginx/conf.d/resolver.conf

# start service
exec "$@"