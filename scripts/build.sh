#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
IMAGE_REPOSITORY=${IMAGE_REPOSITORY:-neon-drift-hk}
IMAGE_TAG=${IMAGE_TAG:-latest}

case "$IMAGE_REPOSITORY" in
  *[!a-zA-Z0-9._/-]*|'')
    echo "IMAGE_REPOSITORY contains unsupported characters: $IMAGE_REPOSITORY" >&2
    exit 2
    ;;
esac

case "$IMAGE_TAG" in
  *[!a-zA-Z0-9._-]*|'')
    echo "IMAGE_TAG contains unsupported characters: $IMAGE_TAG" >&2
    exit 2
    ;;
esac

cd "$PROJECT_ROOT"

echo "Installing locked dependencies"
npm ci

echo "Running unit tests"
npm run test

echo "Building production assets"
npm run build

echo "Building container image $IMAGE_REPOSITORY:$IMAGE_TAG"
docker build --tag "$IMAGE_REPOSITORY:$IMAGE_TAG" .

echo "Build complete: $IMAGE_REPOSITORY:$IMAGE_TAG"

