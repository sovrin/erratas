#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="docker/backups"
BACKUP_FILE="pb-data-$(date +%Y%m%d-%H%M%S).tar.gz"

mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v erratas_data:/data \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/$BACKUP_FILE" -C /data .

echo "Backup written to $BACKUP_DIR/$BACKUP_FILE"
