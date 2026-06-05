#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

manifest_path="$tmpdir/manifest.json"
worktree="$tmpdir/worktree"
git worktree add --detach "$worktree" HEAD >/dev/null
trap 'git worktree remove --force "$worktree" >/dev/null 2>&1 || true; rm -rf "$tmpdir"' EXIT

(
  cd "$worktree"
  bash ./tools/generate-driver-agent-revisions.sh --platform darwin/arm64 >/dev/null
)

cat >"$manifest_path" <<'EOF'
{
  "schemaVersion": 1,
  "generatedFrom": "test",
  "assets": {
    "clickhouse-driver-agent-darwin-arm64": {
      "driver": "clickhouse",
      "driverType": "clickhouse",
      "platform": "darwin/arm64",
      "revision": "__CLICKHOUSE__",
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

revision_file="$worktree/internal/db/driver_agent_revisions_gen.go"
clickhouse_revision="$(awk '/"clickhouse"/ { if (match($0, /"src-[^"]+"/)) { print substr($0, RSTART + 1, RLENGTH - 2); exit } }' "$revision_file")"
mariadb_revision="$(awk '/"mariadb"/ { if (match($0, /"src-[^"]+"/)) { print substr($0, RSTART + 1, RLENGTH - 2); exit } }' "$revision_file")"

python3 - "$manifest_path" "$clickhouse_revision" "$mariadb_revision" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
clickhouse = sys.argv[2]
mariadb = sys.argv[3]
data = json.loads(path.read_text(encoding="utf-8"))
data["assets"]["clickhouse-driver-agent-darwin-arm64"]["revision"] = clickhouse
data["assets"]["mariadb-driver-agent-darwin-arm64"]["revision"] = mariadb
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

bash ./tools/validate-driver-release-manifest.sh --commit HEAD --manifest "$manifest_path"
echo "validate-driver-release-manifest test passed"
