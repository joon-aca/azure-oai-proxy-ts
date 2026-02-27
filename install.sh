#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="azure-oai-proxy"
SERVICE_FILE="$SCRIPT_DIR/$SERVICE_NAME.service"
SYSTEMD_DIR="/etc/systemd/system"

# Check for .env
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  echo "WARNING: No .env file found. Copy example.env to .env and configure it before starting the service."
fi

echo "Installing $SERVICE_NAME systemd service..."

sudo cp "$SERVICE_FILE" "$SYSTEMD_DIR/$SERVICE_NAME.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

echo "Installed and enabled $SERVICE_NAME."
echo ""
echo "To start:   sudo systemctl start $SERVICE_NAME"
echo "To status:  systemctl status $SERVICE_NAME"
echo "To logs:    journalctl -u $SERVICE_NAME -f"
