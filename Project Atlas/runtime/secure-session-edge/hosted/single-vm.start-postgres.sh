#!/bin/sh
set -eu

install -m 0644 /db-config/server.crt /run/atlas-tls/server.crt
install -m 0600 -o postgres -g postgres /db-config/server.key /run/atlas-tls/server.key
exec /usr/local/bin/docker-entrypoint.sh "$@"
