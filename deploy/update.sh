#!/bin/sh
# Pull the latest images; if one changed, restart and health-check both. On failure, roll both back.
set -u
cd /home/azureuser/kf || exit 1
APP=ghcr.io/lut4sayem/knowledgeforge-ai:latest
COLLAB=ghcr.io/lut4sayem/knowledgeforge-collab:latest
log() { echo "$(date -u +%FT%TZ) $*"; }
id_of() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || echo none; }
running() { [ -n "$(docker compose ps --status running -q "$1")" ]; }

old_app=$(id_of "$APP")
old_collab=$(id_of "$COLLAB")
docker compose pull -q app collab || { log "pull failed"; exit 1; }
new_app=$(id_of "$APP")
new_collab=$(id_of "$COLLAB")
[ "$old_app" = "$new_app" ] && [ "$old_collab" = "$new_collab" ] && running app && running collab && exit 0

log "deploying app $new_app (was $old_app), collab $new_collab (was $old_collab)"
[ "$old_app" != none ] && docker tag "$old_app" kf-previous-app
[ "$old_collab" != none ] && docker tag "$old_collab" kf-previous-collab
docker compose up -d

for i in $(seq 1 24); do
  sleep 5
  if curl -fsS http://127.0.0.1:8080/actuator/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:1234/health >/dev/null 2>&1; then
    log "healthy, deploy ok"
    exit 0
  fi
done

log "health check FAILED"
# Both go back together: the app and the collaboration service share the internal API.
[ "$old_app" != none ] && docker tag kf-previous-app "$APP"
[ "$old_collab" != none ] && docker tag kf-previous-collab "$COLLAB"
docker compose up -d
log "rolled back to app $old_app, collab $old_collab"
exit 1
