#!/usr/bin/env bash
# backup-db.sh — dump both Supabase databases to local files under backups/
# Usage: bash scripts/backup-db.sh [prod|staging|both]  (default: both)
#
# Requires: supabase CLI authenticated (run `supabase login` once if not already done)
# Output:   backups/prod/prod_YYYY-MM-DD_HH-MM-SS.sql
#           backups/staging/staging_YYYY-MM-DD_HH-MM-SS.sql

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$ROOT/backups"
TS="$(date +%Y-%m-%d_%H-%M-%S)"
PROD_REF="efjnltsombshrimuohtb"
STAGING_REF="aykgexwofckejdozejoo"
TARGET="${1:-both}"

mkdir -p "$BACKUP_DIR/prod" "$BACKUP_DIR/staging"

if [[ "$TARGET" == "prod" || "$TARGET" == "both" ]]; then
  echo "→ Backing up production (${PROD_REF})..."
  supabase db dump --project-ref "$PROD_REF" > "$BACKUP_DIR/prod/prod_${TS}.sql"
  SIZE=$(du -sh "$BACKUP_DIR/prod/prod_${TS}.sql" | cut -f1)
  echo "  ✓ prod_${TS}.sql  (${SIZE})"
fi

if [[ "$TARGET" == "staging" || "$TARGET" == "both" ]]; then
  echo "→ Backing up staging (${STAGING_REF})..."
  supabase db dump --project-ref "$STAGING_REF" > "$BACKUP_DIR/staging/staging_${TS}.sql"
  SIZE=$(du -sh "$BACKUP_DIR/staging/staging_${TS}.sql" | cut -f1)
  echo "  ✓ staging_${TS}.sql  (${SIZE})"
fi

echo ""
echo "Backups saved to: $BACKUP_DIR"
echo "Keep at least the last 3 dumps per environment. Delete older ones manually."
