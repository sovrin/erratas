#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

LATEST=$(ls -t docker/backups/pb-data-*.tar.gz 2>/dev/null | head -n1)
if [ -z "$LATEST" ]; then
  echo "No backups found in docker/backups" >&2
  exit 1
fi

echo "This will DELETE the current PocketBase data and replace it with:"
echo "  $LATEST"
read -r -p "Continue? [y/N] " REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

docker compose -f docker/docker-compose.yml stop database
docker run --rm \
  -v erratas_data:/data \
  -v "$(pwd)/docker/backups:/backup" \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$LATEST") -C /data"
docker compose -f docker/docker-compose.yml up -d database
echo "Restore complete."
