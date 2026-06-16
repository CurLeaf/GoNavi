#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/gonavi-compress-driver-artifact.XXXXXX")"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

windows_amd64_bin="$tmpdir/windows-driver-agent-windows-amd64.exe"
printf 'fake windows amd64 driver' >"$windows_amd64_bin"
windows_amd64_before="$(cat "$windows_amd64_bin")"
windows_skip_output="$(bash "$repo_root/tools/compress-driver-artifact.sh" "$windows_amd64_bin" "windows/amd64" "windows-amd64-driver" 2>&1)"
if [[ "$windows_skip_output" != *"Windows amd64 驱动产物不执行 UPX 压缩"* ]]; then
  echo "expected Windows amd64 driver artifact UPX compression to be skipped" >&2
  echo "$windows_skip_output" >&2
  exit 1
fi
if [[ "$(cat "$windows_amd64_bin")" != "$windows_amd64_before" ]]; then
  echo "expected Windows amd64 driver artifact to remain unchanged when UPX is skipped" >&2
  exit 1
fi

host_platform="$(go env GOOS)/$(go env GOARCH)"
case "$host_platform" in
  linux/amd64|linux/arm64)
    ;;
  *)
    echo "skip compress-driver-artifact smoke test on unsupported host platform: $host_platform"
    exit 0
    ;;
esac

suffix=""
if [[ "$host_platform" == windows/* ]]; then
  suffix=".exe"
fi

good_src="$tmpdir/good.go"
bad_src="$tmpdir/bad.go"
good_bin="$tmpdir/good-driver-agent-${host_platform/\//-}${suffix}"
bad_bin="$tmpdir/bad-driver-agent-${host_platform/\//-}${suffix}"
recover_bin="$tmpdir/recover-driver-agent-${host_platform/\//-}${suffix}"
fakebin="$tmpdir/bin"
mkdir -p "$fakebin"

cat >"$good_src" <<'GOEOF'
package main

import (
  "bufio"
  "fmt"
  "os"
  "strings"
)

func main() {
  scanner := bufio.NewScanner(os.Stdin)
  for scanner.Scan() {
    if strings.TrimSpace(scanner.Text()) == "" {
      continue
    }
    fmt.Println(`{"id":1,"success":true,"data":{"agentRevision":"src-test"}}`)
    return
  }
}
GOEOF

cat >"$bad_src" <<'GOEOF'
package main

func main() {}
GOEOF

go build -o "$good_bin" "$good_src"
go build -o "$bad_bin" "$bad_src"
cp "$good_bin" "$recover_bin"

cat >"$fakebin/upx" <<'SHEOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-t" ]]; then
  exit 0
fi

target="${*: -1}"
if [[ -n "${FAKE_UPX_REPLACE:-}" && "$target" == *"recover-driver-agent-"* ]]; then
  cp "$FAKE_UPX_REPLACE" "$target"
fi
SHEOF
chmod +x "$fakebin/upx"

PATH="$fakebin:$PATH" bash "$repo_root/tools/compress-driver-artifact.sh" "$good_bin" "$host_platform" "good"
metadata_output="$(printf '%s\n' '{"id":1,"method":"metadata"}' | "$good_bin")"
if [[ "$metadata_output" != *'"agentRevision":"src-test"'* ]]; then
  echo "expected metadata smoke test to keep good driver-agent executable" >&2
  exit 1
fi

warning_output="$(
  FAKE_UPX_REPLACE="$bad_bin" PATH="$fakebin:$PATH" bash "$repo_root/tools/compress-driver-artifact.sh" "$recover_bin" "$host_platform" "recover" 2>&1
)"
if [[ "$warning_output" != *"metadata 自检失败"* ]]; then
  echo "expected metadata smoke-test warning when fake UPX replacement breaks the executable" >&2
  echo "$warning_output" >&2
  exit 1
fi

recovered_output="$(printf '%s\n' '{"id":1,"method":"metadata"}' | "$recover_bin")"
if [[ "$recovered_output" != *'"agentRevision":"src-test"'* ]]; then
  echo "expected metadata smoke-test failure to restore original driver-agent binary" >&2
  exit 1
fi

echo "compress-driver-artifact smoke test passed"
