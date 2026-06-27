#!/bin/sh

BEFORE=$(git rev-parse HEAD)

git pull origin main

AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date, skipping rebuild."
else
  bun run build
fi
