#!/bin/sh
# Regenerate the runtime config (and optional DICOMweb reverse proxy) from
# environment variables before nginx starts. Runs as uid 101 via the base
# image's /docker-entrypoint.d mechanism, so one image serves any PACS.
set -eu

HTML_DIR="${ORBIDICOM_HTML_DIR:-/usr/share/nginx/html}"
PACS_URL="${ORBIDICOM_PACS_URL:-}"
STUDY_UID="${ORBIDICOM_STUDY_UID:-}"
PACS_UPSTREAM="${ORBIDICOM_PACS_UPSTREAM:-}"

# Strip characters that would break out of the JS string literals below. The
# values are operator-supplied (Helm), so this is belt-and-braces, not a trust
# boundary.
sanitize() {
    printf '%s' "$1" | tr -d '"\\\n\r'
}
PACS_URL="$(sanitize "$PACS_URL")"
STUDY_UID="$(sanitize "$STUDY_UID")"

# PACS auth. ORBIDICOM_AUTH_KIND ∈ none|cookie|bearer|basic (default none →
# same-origin; cookies are still sent for same-origin requests). SECURITY: bearer/
# basic credentials are written into the client-readable config.js, so only use them
# on trusted/internal deployments.
AUTH_KIND="${ORBIDICOM_AUTH_KIND:-}"
AUTH_TOKEN="$(sanitize "${ORBIDICOM_AUTH_TOKEN:-}")"
AUTH_USERNAME="$(sanitize "${ORBIDICOM_AUTH_USERNAME:-}")"
AUTH_PASSWORD="$(sanitize "${ORBIDICOM_AUTH_PASSWORD:-}")"
case "$AUTH_KIND" in
  cookie) AUTH_LINE='  auth: { kind: "cookie" },' ;;
  bearer) AUTH_LINE="  auth: { kind: \"bearer\", token: \"${AUTH_TOKEN}\" }," ;;
  basic)  AUTH_LINE="  auth: { kind: \"basic\", username: \"${AUTH_USERNAME}\", password: \"${AUTH_PASSWORD}\" }," ;;
  *)      AUTH_LINE="" ;;
esac

# 1) Runtime app config (consumed by config.ts → window.__ORBIDICOM_CONFIG__).
{
  echo "window.__ORBIDICOM_CONFIG__ = {"
  echo "  pacsUrl: \"${PACS_URL}\","
  echo "  studyUid: \"${STUDY_UID}\","
  [ -n "$AUTH_LINE" ] && echo "$AUTH_LINE"
  echo "};"
} > "${HTML_DIR}/config.js"
echo "orbidicom: wrote config.js (pacsUrl='${PACS_URL}', studyUid='${STUDY_UID}', auth='${AUTH_KIND:-none}')"

# 2) Optional same-origin DICOMweb reverse proxy → keeps the PACS in-cluster and
#    sidesteps browser CORS. Only emitted when an upstream is provided.
CONF_DIR="/etc/nginx/orbidicom.d"
mkdir -p "$CONF_DIR"
rm -f "${CONF_DIR}/pacs.conf"
if [ -n "$PACS_UPSTREAM" ]; then
    UP="${PACS_UPSTREAM%/}"
    cat > "${CONF_DIR}/pacs.conf" <<EOF
location /dicom-web/ {
    proxy_pass ${UP}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 300s;
    client_max_body_size 0;
}
EOF
    echo "orbidicom: enabled /dicom-web reverse proxy -> ${UP}/"
fi
