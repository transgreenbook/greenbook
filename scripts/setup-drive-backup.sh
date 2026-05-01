#!/usr/bin/env bash
# One-time setup for Google Drive backups via rclone on the production server.
#
# Run this once on the production server as the app user (root):
#   bash /var/www/transsafetravels/scripts/setup-drive-backup.sh
#
# Prerequisites:
#   - The Google service account JSON is on the server (copy from dev if needed)
#   - The Drive API is enabled for the service account's GCP project
#   - A folder in Google Drive has been shared with the service account email

set -euo pipefail

APP_DIR="/var/www/transsafetravels"
SERVICE_FILE="$HOME/.config/systemd/user/greenbook-backup.service"
RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"
REMOTE_NAME="gdrive"
REMOTE_PATH="greenbook-backups"

# ── 1. Install rclone ─────────────────────────────────────────────────────────
if command -v rclone &>/dev/null; then
  echo "✓ rclone already installed: $(rclone version | head -1)"
else
  echo "→ Installing rclone..."
  curl -fsSL https://rclone.org/install.sh | bash
  echo "✓ rclone installed."
fi

# ── 2. Locate service account JSON ───────────────────────────────────────────
echo ""
echo "Enter the full path to the Google service account JSON file on this server:"
echo "  (copy it from dev with: scp dev:/path/to/file.json root@transsafetravels.com:~/)"
read -rp "Path: " SA_JSON

if [ ! -f "$SA_JSON" ]; then
  echo "ERROR: File not found: $SA_JSON"
  exit 1
fi

SA_EMAIL=$(python3 -c "import json,sys; print(json.load(open('$SA_JSON'))['client_email'])" 2>/dev/null || \
           node -e "const j=require('$SA_JSON'); console.log(j.client_email)" 2>/dev/null || \
           grep -o '"client_email": *"[^"]*"' "$SA_JSON" | cut -d'"' -f4)
echo "  Service account email: $SA_EMAIL"

# ── 3. Write rclone config ────────────────────────────────────────────────────
echo ""
echo "→ Writing rclone config to $RCLONE_CONFIG ..."
mkdir -p "$(dirname "$RCLONE_CONFIG")"

cat > "$RCLONE_CONFIG" <<EOF
[$REMOTE_NAME]
type = drive
scope = drive
service_account_file = $SA_JSON
EOF

echo "✓ rclone config written."

# ── 4. Verify: list the shared folder ────────────────────────────────────────
echo ""
echo "→ Testing connection — listing $REMOTE_NAME: ..."
echo "  (If this is empty, make sure the Drive folder '$REMOTE_PATH' exists"
echo "   and is shared with: $SA_EMAIL)"
rclone lsd "$REMOTE_NAME:" || true

echo ""
read -rp "Does the folder '$REMOTE_PATH' appear above? If not, create it in Drive and share it, then press Enter to continue..."

# ── 5. Update systemd service ─────────────────────────────────────────────────
echo ""
echo "→ Adding RCLONE_REMOTE to systemd service..."

if grep -q "RCLONE_REMOTE" "$SERVICE_FILE" 2>/dev/null; then
  echo "  Already set — skipping."
else
  # Insert Environment line after [Service]
  sed -i "/^\[Service\]/a Environment=RCLONE_REMOTE=$REMOTE_NAME:$REMOTE_PATH" "$SERVICE_FILE"
  systemctl --user daemon-reload
  echo "✓ Service updated and daemon reloaded."
fi

# ── 6. Test run ───────────────────────────────────────────────────────────────
echo ""
read -rp "Run a backup now to test the upload? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  RCLONE_REMOTE="$REMOTE_NAME:$REMOTE_PATH" bash "$APP_DIR/scripts/backup-db.sh"
fi

echo ""
echo "✓ Setup complete. Nightly backups will upload to Google Drive ($REMOTE_NAME:$REMOTE_PATH)."
echo "  To check: rclone ls $REMOTE_NAME:$REMOTE_PATH"
