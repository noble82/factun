#!/usr/bin/env bash
set -euo pipefail

# deploy-cert.sh - Emite certificados Let’s Encrypt (staging|prod) usando el servicio certbot
# Uso: ./deploy-cert.sh -d DOMAIN -e EMAIL [-m staging|prod] [-f]

DOMAIN=""
EMAIL=""
MODE="prod"
FORCE=0

usage(){
  cat <<EOF
Usage: $0 -d DOMAIN -e EMAIL [-m staging|prod] [-f]

Options:
  -d DOMAIN   Dominio a emitir (ej. test.irya.xyz)
  -e EMAIL    Correo para registro en Let's Encrypt
  -m MODE     'staging' para pruebas (default 'prod')
  -f          Forzar re-emisión aunque ya existan certs
  -h          Mostrar esta ayuda
EOF
}

while getopts ":d:e:m:fh" opt; do
  case ${opt} in
    d ) DOMAIN="$OPTARG" ;;
    e ) EMAIL="$OPTARG" ;;
    m ) MODE="$OPTARG" ;;
    f ) FORCE=1 ;;
    h ) usage; exit 0 ;;
    \? ) echo "Invalid option: -$OPTARG" >&2; usage; exit 1 ;;
    : ) echo "Option -$OPTARG requires an argument." >&2; usage; exit 1 ;;
  esac
done

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "ERROR: DOMAIN and EMAIL are required." >&2
  usage
  exit 1
fi

if [ "$MODE" != "staging" ] && [ "$MODE" != "prod" ]; then
  echo "ERROR: MODE must be 'staging' or 'prod'" >&2
  exit 1
fi

if [ $FORCE -eq 0 ] && [ -f "./certs/live/${DOMAIN}/fullchain.pem" ]; then
  echo "Certificate already exists for ${DOMAIN} at ./certs/live/${DOMAIN}/fullchain.pem"
  echo "Use -f to force re-issue."
  exit 0
fi

STAGING_FLAG=""
if [ "$MODE" = "staging" ]; then
  STAGING_FLAG="--staging"
  echo "Running in STAGING mode (no-valid certs, for testing)"
fi

echo "Ensuring local volumes exist: ./certs ./certbot-www"
mkdir -p ./certs ./certbot-www
chmod 755 ./certs ./certbot-www || true

echo "Bringing up frontend and certbot containers"
docker compose up -d frontend certbot || true

echo "Requesting certificate for ${DOMAIN} (email: ${EMAIL})"
# When the certbot service has an overridden entrypoint, invoke the certbot binary explicitly
docker compose run --rm certbot certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" \
  --email "${EMAIL}" --agree-tos --no-eff-email ${STAGING_FLAG}

echo "Reloading nginx to apply certificates"
if docker compose exec -T frontend nginx -s reload; then
  echo "nginx reloaded via docker compose exec"
else
  echo "docker compose exec failed, trying docker exec by container name"
  docker exec digifact-frontend nginx -s reload || echo "nginx reload failed, check container name"
fi

echo "Done. Verify with: curl -vk https://${DOMAIN}/healthz"
