#!/bin/sh

REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
  esac
done

if [ "$REBUILD" = "1" ] || [ ! -d "dist" ]; then
  echo "Building the app..."
  bun run build > /dev/null 2>&1
fi

if [ ! -f "dist/.env" ]; then
  echo "Copying .env to dist..."
  cp dist/.env.example dist/.env
fi

bun run start
