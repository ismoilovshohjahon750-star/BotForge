#!/usr/bin/env bash
set -e

# Install Go to local directory if not already installed
if [ ! -f .go/bin/go ]; then
  echo "Installing Go..."
  mkdir -p .go
  curl -L https://go.dev/dl/go1.23.0.linux-amd64.tar.gz -o go.tar.gz
  tar -C .go -xzf go.tar.gz --strip-components=1
  rm -f go.tar.gz
fi

# Ensure all dependencies (including devDependencies) are installed
echo "Installing all dependencies including devDependencies..."
npm ci --include=dev || npm install --production=false

# Build static site and server bundle
echo "Building static site and server..."
npx vite build
npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

