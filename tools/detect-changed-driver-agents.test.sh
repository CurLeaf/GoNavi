#!/usr/bin/env bash

set -euo pipefail

if [[ "${BASH_VERSINFO[0]:-0}" -lt 4 ]]; then
  echo "skip: detect-changed-driver-agents.sh requires Bash 4+ for associative arrays; current bash is ${BASH_VERSION:-unknown}"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/gonavi-detect-driver-revisions.XXXXXX")"
tmpdir_script=""
cleanup() {
  rm -rf "$tmpdir"
  if [[ -n "$tmpdir_script" ]]; then
    rm -rf "$tmpdir_script"
  fi
}
trap cleanup EXIT

git init -q "$tmpdir"
mkdir -p "$tmpdir/tools"
cp tools/detect-changed-driver-agents.sh "$tmpdir/tools/detect-changed-driver-agents.sh"
mkdir -p "$tmpdir/internal/db"
cat >"$tmpdir/internal/db/driver_agent_revisions_gen.go" <<'GOEOF'
package db

func init() {
	optionalDriverAgentRevisions = map[string]string{
		"mariadb":    "src-old-mariadb",
		"clickhouse": "src-old-clickhouse",
	}
}
GOEOF

(
  cd "$tmpdir"
  git add .
  git -c user.name=GoNavi -c user.email=gonavi@example.test commit -q -m initial
  base="$(git rev-parse HEAD)"
  perl -0pi -e 's/src-old-clickhouse/src-new-clickhouse/' internal/db/driver_agent_revisions_gen.go
  git add internal/db/driver_agent_revisions_gen.go
  git -c user.name=GoNavi -c user.email=gonavi@example.test commit -q -m 'update clickhouse revision'
  actual="$(bash ./tools/detect-changed-driver-agents.sh --base "$base" --head HEAD)"
  if [[ "$actual" != "clickhouse" ]]; then
    echo "expected clickhouse revision-only change to trigger clickhouse build, got: ${actual:-<empty>}" >&2
    exit 1
  fi
)

tmpdir_script="$(mktemp -d "${TMPDIR:-/tmp}/gonavi-detect-script-change.XXXXXX")"
git init -q "$tmpdir_script"
mkdir -p "$tmpdir_script/tools"
cp tools/detect-changed-driver-agents.sh "$tmpdir_script/tools/detect-changed-driver-agents.sh"
(
  cd "$tmpdir_script"
  git add .
  git -c user.name=GoNavi -c user.email=gonavi@example.test commit -q -m initial
  base="$(git rev-parse HEAD)"
  printf '\n# test change\n' >> tools/detect-changed-driver-agents.sh
  git add tools/detect-changed-driver-agents.sh
  git -c user.name=GoNavi -c user.email=gonavi@example.test commit -q -m 'update detection script'
  actual="$(bash ./tools/detect-changed-driver-agents.sh --base "$base" --head HEAD 2>/dev/null)"
  if [[ "$actual" != *"mariadb"* || "$actual" != *"clickhouse"* || "$actual" != *"elasticsearch"* ]]; then
    echo "expected detection script change to trigger all driver builds, got: ${actual:-<empty>}" >&2
    exit 1
  fi
)

echo "detect-changed-driver-agents revision test passed"
