#!/usr/bin/env bash
# Sets up (or updates) littlenote on a fresh Ubuntu server, e.g. a DigitalOcean droplet.
# Run as root, with your domain:
#
#   curl -fsSL https://raw.githubusercontent.com/Eboredrag/littlenote/main/scripts/setup-server.sh | DOMAIN=littlenote.io bash
#
# Running it again later pulls the latest code and restarts the app.
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN to your domain, e.g. DOMAIN=littlenote.io}"
REPO="${REPO:-https://github.com/Eboredrag/littlenote.git}"
DIR="${DIR:-/opt/littlenote}"

step() { printf '\n==> %s\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (or with sudo)." >&2
  exit 1
fi

step "Swap (2 GB): building the app needs more than 1 GB of memory"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap added."
else
  echo "Swap already set up."
fi

step "Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "Docker already installed."
fi
command -v git >/dev/null 2>&1 || { apt-get update -q && apt-get install -yq git; }

step "Firewall: SSH, HTTP and HTTPS only"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
  echo "Firewall on."
else
  echo "ufw not found; make sure ports 80 and 443 are open."
fi

step "Code in $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone "$REPO" "$DIR"
fi

step "Settings"
printf 'DOMAIN=%s\n' "$DOMAIN" > "$DIR/.env"
echo "DOMAIN=$DOMAIN written to $DIR/.env"

# HTTPS only works once the domain points here, so warn early if it doesn't.
SERVER_IP="$(curl -fsS --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
DOMAIN_IPS="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
if [ -n "$SERVER_IP" ] && ! printf '%s' "$DOMAIN_IPS" | grep -qw "$SERVER_IP"; then
  echo "Warning: $DOMAIN points to '${DOMAIN_IPS:-nothing}', not this server ($SERVER_IP)."
  echo "Add an A record for $DOMAIN -> $SERVER_IP. Caddy keeps retrying the certificate until it does."
fi

step "Build and start (the first build takes a few minutes)"
cd "$DIR"
docker compose up -d --build
docker compose ps

printf '\nDone. Open https://%s\n' "$DOMAIN"
echo "Logs: cd $DIR && docker compose logs -f"
