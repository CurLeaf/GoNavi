#!/bin/bash
# 打本机 Linux amd64 包，并刷新当前用户应用菜单里的 GoNavi。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GO_ROOT="$HOME/.vfox/cache/golang/v-1.25.0/golang-1.25.0"
if [ -x "$GO_ROOT/bin/go" ]; then
  export GOROOT="$GO_ROOT"
  export GOPATH="${GOPATH:-$GO_ROOT/packages}"
  export PATH="$GO_ROOT/bin:$GOPATH/bin:$HOME/go/bin:$PATH"
fi
export CGO_ENABLED=1

if ! command -v wails >/dev/null 2>&1; then
  echo "找不到 wails，请先安装到 PATH 或 ~/go/bin。" >&2
  exit 1
fi

VERSION="$(head -n 1 version/dev-version.txt | tr -d '\r' | tr -d '[:space:]')"
if [ -z "$VERSION" ]; then
  echo "version/dev-version.txt 为空" >&2
  exit 1
fi

LDFLAGS="-s -w -X GoNavi-Wails/internal/app.AppVersion=$VERSION"
echo "打包 GoNavi $VERSION (linux/amd64)"

./tools/generate-driver-agent-revisions.sh --platform linux/amd64
wails build -trimpath -platform linux/amd64 -ldflags "$LDFLAGS"

mkdir -p dist
BIN="build/bin/GoNavi"
cp -f "$BIN" "dist/GoNavi-${VERSION}-linux-amd64"
cp -f "$BIN" dist/GoNavi
chmod +x "$BIN" dist/GoNavi "dist/GoNavi-${VERSION}-linux-amd64"
tar -C dist -czf "dist/GoNavi-${VERSION}-linux-amd64.tar.gz" "GoNavi-${VERSION}-linux-amd64"

"$ROOT/scripts/install-linux-desktop.sh" "$ROOT/dist/GoNavi"
echo "压缩包：dist/GoNavi-${VERSION}-linux-amd64.tar.gz"
