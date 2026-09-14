#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
IMAGE_REPOSITORY=${IMAGE_REPOSITORY:-neon-drift-hk}
IMAGE_TAG=${IMAGE_TAG:-latest}
CONTAINER_NAME=${CONTAINER_NAME:-neon-drift-hk}
APP_PORT=${APP_PORT:-8080}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-neon-drift-hk}
HEALTH_RETRIES=${HEALTH_RETRIES:-30}

case "$APP_PORT" in
  *[!0-9]*|'')
    echo "APP_PORT must be an integer between 1 and 65535" >&2
    exit 2
    ;;
esac

if [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  echo "APP_PORT must be an integer between 1 and 65535" >&2
  exit 2
fi

case "$HEALTH_RETRIES" in
  *[!0-9]*|'0'|'')
    echo "HEALTH_RETRIES must be a positive integer" >&2
    exit 2
    ;;
esac

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running or is not accessible" >&2
  exit 1
fi

cd "$PROJECT_ROOT"

if ! docker image inspect "$IMAGE_REPOSITORY:$IMAGE_TAG" >/dev/null 2>&1; then
  echo "Image $IMAGE_REPOSITORY:$IMAGE_TAG was not found; building it first"
  IMAGE_REPOSITORY="$IMAGE_REPOSITORY" IMAGE_TAG="$IMAGE_TAG" "$PROJECT_ROOT/scripts/build.sh"
fi

export IMAGE_REPOSITORY IMAGE_TAG CONTAINER_NAME APP_PORT COMPOSE_PROJECT_NAME

echo "Deploying $IMAGE_REPOSITORY:$IMAGE_TAG on port $APP_PORT"
docker compose --project-name "$COMPOSE_PROJECT_NAME" up --detach --force-recreate --remove-orphans

attempt=1
while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
  if curl --fail --silent --show-error "http://127.0.0.1:$APP_PORT/healthz" >/dev/null 2>&1; then
    echo "Deployment healthy: http://127.0.0.1:$APP_PORT"
    docker compose --project-name "$COMPOSE_PROJECT_NAME" ps
    exit 0
  fi

  sleep 1
  attempt=$((attempt + 1))
done

echo "Deployment did not become healthy after $HEALTH_RETRIES attempts" >&2
docker compose --project-name "$COMPOSE_PROJECT_NAME" ps >&2
docker compose --project-name "$COMPOSE_PROJECT_NAME" logs --tail 100 game >&2
exit 1
