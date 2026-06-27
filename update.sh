#!/bin/sh

# pull the latest changes from the remote repository
git pull origin main

# rebuild the app
bun run build
