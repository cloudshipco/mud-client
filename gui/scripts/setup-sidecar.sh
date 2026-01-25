#!/bin/bash
# Build the mud-client binary and copy it to the sidecar location with the correct name

set -e

cd "$(dirname "$0")/../.."

# Detect architecture
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        TARGET="aarch64-apple-darwin"
    else
        TARGET="x86_64-apple-darwin"
    fi
elif [ "$OS" = "Linux" ]; then
    if [ "$ARCH" = "aarch64" ]; then
        TARGET="aarch64-unknown-linux-gnu"
    else
        TARGET="x86_64-unknown-linux-gnu"
    fi
else
    echo "Unsupported OS: $OS"
    exit 1
fi

echo "Building mud-client for $TARGET..."
bun build --compile --outfile="gui/src-tauri/binaries/mud-client-$TARGET" src/raw/index.ts

# Also copy to target/debug for development mode
mkdir -p "gui/src-tauri/target/debug"
cp "gui/src-tauri/binaries/mud-client-$TARGET" "gui/src-tauri/target/debug/mud-client"

echo "Sidecar ready at: gui/src-tauri/binaries/mud-client-$TARGET"
echo "Dev sidecar ready at: gui/src-tauri/target/debug/mud-client"
