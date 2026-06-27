#!/bin/sh

# build the app if hasn't been built yet
# silent the command output
if [ ! -d "dist" ]; then
    echo "Building the app..."
    bun run build > /dev/null 2>&1
fi

# copy .env if it doesn't exist in dist
if [ ! -f "dist/.env" ]; then
    echo "Copying .env to dist..."
    cp dist/.env.example dist/.env
fi

# run the app
bun run start
