#!/bin/bash
set -e

OUTDIR="dist"
mkdir -p "$OUTDIR"

TARGET="${1:-all}"

build_windows() {
    echo "[*] Building for Windows (amd64)..."
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o "$OUTDIR/agentruntime.exe" ./cmd/agent/
    echo "    -> $OUTDIR/agentruntime.exe"
}

build_linux() {
    echo "[*] Building for Linux (amd64)..."
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "-s -w" -o "$OUTDIR/agentruntime-linux-amd64" ./cmd/agent/
    echo "    -> $OUTDIR/agentruntime-linux-amd64"
}

build_linux_arm64() {
    echo "[*] Building for Linux (arm64)..."
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "-s -w" -o "$OUTDIR/agentruntime-linux-arm64" ./cmd/agent/
    echo "    -> $OUTDIR/agentruntime-linux-arm64"
}

case "$TARGET" in
    windows)    build_windows ;;
    linux)      build_linux ;;
    linux-arm64) build_linux_arm64 ;;
    all)
        build_windows
        build_linux
        build_linux_arm64
        echo ""
        echo "Build complete:"
        ls -lh "$OUTDIR/"
        ;;
    *)
        echo "Usage: $0 [windows|linux|linux-arm64|all]"
        exit 1
        ;;
esac
