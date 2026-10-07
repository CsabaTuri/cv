#!/usr/bin/env bash
# cv-update.sh – one command to update the whole stack
# Usage: ./cv-update.sh [--no-pull]
#
# Requirements:
#   - run from the repo root (where docker-compose.yml and .env live)
#   - .env must contain ADMIN_TOKEN, MYSQL_*, etc.
#   - GHCR_TOKEN env var (or docker already logged in to ghcr.io)
#
# What it does:
#   1. git fetch origin main
#   2. read the short SHA of the latest commit
#   3. update IMAGE_TAG_* entries in .env
#   4. docker compose pull + up -d (with the prod overlay)

set -euo pipefail

# ---------- configuration ----------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

ENV_FILE=".env"
COMPOSE_BASE="docker-compose.yml"
COMPOSE_PROD="docker-compose.prod.yml"
BRANCH="main"
GHCR_USER="CsabaTuri"
GHCR_REGISTRY="ghcr.io"

# ---------- colors ----------
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

info()  { printf '%s[info]%s  %s\n' "$BLUE"   "$NC" "$*"; }
ok()    { printf '%s[ok]%s    %s\n' "$GREEN"  "$NC" "$*"; }
warn()  { printf '%s[warn]%s  %s\n' "$YELLOW" "$NC" "$*"; }
err()   { printf '%s[error]%s %s\n' "$RED"    "$NC" "$*" >&2; }
die()   { err "$*"; exit 1; }

# ---------- 0. sanity checks ----------
[[ -f "$COMPOSE_BASE" ]] || die "Missing $COMPOSE_BASE – run this script from the repo root."
[[ -f "$COMPOSE_PROD" ]] || die "Missing $COMPOSE_PROD – run this script from the repo root."
[[ -f "$ENV_FILE"     ]] || die "Missing $ENV_FILE – first: cp .env.example .env && \$EDITOR .env"

command -v git    >/dev/null || die "git is not installed."
command -v docker >/dev/null || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "docker compose plugin is not installed."

# ---------- 1. latest commit SHA ----------
info "Fetching latest commit from branch '$BRANCH'…"
git fetch --quiet origin "$BRANCH" || die "git fetch failed (network? permissions?)."

# The compose files that describe the stack come from this checkout, so the
# working tree has to follow the branch: without it a host keeps starting the
# stack it was checked out at, even though the images are new.
info "Updating the working tree…"
git pull --ff-only origin "$BRANCH" \
  || die "git pull failed – commit or stash the local changes on this host first."

# --short=7 has to match the tag the CI publishes (.github/workflows/ci.yml).
NEW_SHA="$(git rev-parse --short=7 "origin/$BRANCH")"
[[ -n "$NEW_SHA" ]] || die "Could not read the commit SHA."

CURRENT_SHA="$(grep -E '^IMAGE_TAG_CV=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
CURRENT_SHA="${CURRENT_SHA#sha-}"

printf '  %s\n' "origin/$BRANCH → sha-$NEW_SHA"
[[ -n "$CURRENT_SHA" ]] && printf '  %s\n' ".env currently  → sha-$CURRENT_SHA"

# ---------- 2. update .env ----------
update_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # BSD/macOS sed doesn't support -i'' the same way; use a tmp file
    local tmp; tmp="$(mktemp)"
    sed "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

if [[ "${NEW_SHA}" != "${CURRENT_SHA}" ]]; then
  info "Updating image tags: sha-$CURRENT_SHA → sha-$NEW_SHA"
  update_env IMAGE_TAG_CV           "sha-$NEW_SHA"
  update_env IMAGE_TAG_CHAT_BACKEND "sha-$NEW_SHA"
  update_env IMAGE_TAG_DEPLOYER     "sha-$NEW_SHA"
  ok ".env updated."
else
  ok ".env already points at the latest commit (sha-$NEW_SHA)."
fi

# ---------- 3. ghcr.io login ----------
if [[ -n "${GHCR_TOKEN:-}" ]]; then
  info "Logging in to $GHCR_REGISTRY as $GHCR_USER…"
  if echo "$GHCR_TOKEN" | docker login "$GHCR_REGISTRY" -u "$GHCR_USER" --password-stdin >/dev/null 2>&1; then
    ok "Logged in."
  else
    die "ghcr.io login failed – check GHCR_TOKEN (needs read:packages scope)."
  fi
else
  warn "GHCR_TOKEN is not set – assuming docker is already logged in."
  warn "If pull returns 401/403: export GHCR_TOKEN=... and re-run."
fi

# ---------- 4. pull + up ----------
COMPOSE=(docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_PROD")

if [[ "${1:-}" != "--no-pull" ]]; then
  info "Pulling images…"
  "${COMPOSE[@]}" pull
else
  warn "--no-pull: skipping pull."
fi

info "Restarting containers…"
"${COMPOSE[@]}" up -d --remove-orphans

# ---------- 5. status ----------
echo
info "Container status:"
"${COMPOSE[@]}" ps

# ---------- 6. smoke check ----------
# The service worker and the manifest only exist in a build that has them, so
# these three lines are the quickest way to see whether the frontend really
# moved: a 404 on /sw.js means an old cv image is still running.
SITE_BIND_VALUE="$(grep -E '^SITE_BIND=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
SITE_HOST="${SITE_BIND_VALUE:-0.0.0.0}"
[[ -z "$SITE_HOST" || "$SITE_HOST" == "0.0.0.0" ]] && SITE_HOST="127.0.0.1"
SITE="http://${SITE_HOST}:3036"

if command -v curl >/dev/null; then
  echo
  info "Smoke check on ${SITE}:"
  for path in / /sw.js /manifest.webmanifest /api/health; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${SITE}${path}" || echo "000")"
    if [[ "$code" == "200" ]]; then ok "${path} → 200"; else warn "${path} → ${code}"; fi
  done
fi

echo
ok "Done. Site:  ${SITE}/"
printf '  %s\n' "Logs:   docker compose -f $COMPOSE_BASE -f $COMPOSE_PROD logs -f"
printf '  %s\n' "Admin:  ${SITE}/admin/"