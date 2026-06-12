#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

tmpdir="$(mktemp -d)"
worktrees=()
cleanup() {
  local worktree
  for worktree in "${worktrees[@]+"${worktrees[@]}"}"; do
    git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

manifest_path="$tmpdir/manifest.json"

generate_revision() {
  local platform="$1"
  local driver="$2"
  local worktree revision_file
  worktree="$tmpdir/worktree-${platform//\//-}-${driver}"
  git worktree add --detach "$worktree" HEAD >/dev/null
  worktrees+=("$worktree")
  (
    cd "$worktree"
    bash ./tools/generate-driver-agent-revisions.sh --platform "$platform" --drivers "$driver" >/dev/null
  )
  revision_file="$worktree/internal/db/driver_agent_revisions_gen.go"
  awk -v target="$driver" '
    $0 ~ "\"" target "\"" {
      if (match($0, /"src-[^"]+"/)) {
        print substr($0, RSTART + 1, RLENGTH - 2)
        exit
      }
    }
  ' "$revision_file"
}

cat >"$manifest_path" <<'EOF'
{
  "schemaVersion": 1,
  "generatedFrom": "test",
  "assets": {
    "clickhouse-driver-agent-darwin-arm64": {
      "driver": "clickhouse",
      "driverType": "clickhouse",
      "platform": "darwin/arm64",
      "revision": "__CLICKHOUSE_DARWIN_ARM64__",
      "size": 1
    },
    "clickhouse-driver-agent-linux-amd64": {
      "driver": "clickhouse",
      "driverType": "clickhouse",
      "platform": "linux/amd64",
      "revision": "__CLICKHOUSE_LINUX_AMD64__",
      "size": 1
    },
    "clickhouse-driver-agent-windows-amd64.exe": {
      "driver": "clickhouse",
      "driverType": "clickhouse",
      "platform": "windows/amd64",
      "revision": "__CLICKHOUSE_WINDOWS_AMD64__",
      "size": 1
    },
    "mariadb-driver-agent-darwin-arm64": {
      "driver": "mariadb",
      "driverType": "mariadb",
      "platform": "darwin/arm64",
      "revision": "__MARIADB__",
      "size": 1
    }
  }
}
EOF

clickhouse_darwin_revision="$(generate_revision darwin/arm64 clickhouse)"
clickhouse_linux_revision="$(generate_revision linux/amd64 clickhouse)"
clickhouse_windows_revision="$(generate_revision windows/amd64 clickhouse)"
mariadb_darwin_revision="$(generate_revision darwin/arm64 mariadb)"

python3 - "$manifest_path" "$clickhouse_darwin_revision" "$clickhouse_linux_revision" "$clickhouse_windows_revision" "$mariadb_darwin_revision" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
clickhouse_darwin = sys.argv[2]
clickhouse_linux = sys.argv[3]
clickhouse_windows = sys.argv[4]
mariadb = sys.argv[5]
data = json.loads(path.read_text(encoding="utf-8"))
data["assets"]["clickhouse-driver-agent-darwin-arm64"]["revision"] = clickhouse_darwin
data["assets"]["clickhouse-driver-agent-linux-amd64"]["revision"] = clickhouse_linux
data["assets"]["clickhouse-driver-agent-windows-amd64.exe"]["revision"] = clickhouse_windows
data["assets"]["mariadb-driver-agent-darwin-arm64"]["revision"] = mariadb
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

bash ./tools/validate-driver-release-manifest.sh --commit HEAD --manifest "$manifest_path"
echo "validate-driver-release-manifest test passed"
