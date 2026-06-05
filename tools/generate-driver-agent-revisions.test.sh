#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

extract_revision() {
  local file="$1"
  local driver="$2"
  sed -n "s/.*\"${driver}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n 1
}

run_case() {
  local platform="$1"
  local drivers="$2"
  local tmpdir
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/gonavi-generate-driver-revisions.XXXXXX")"
  trap 'rm -rf "$tmpdir"' RETURN

  rsync -a --exclude .git ./ "$tmpdir/" >/dev/null
  (
    cd "$tmpdir"
    GONAVI_DRIVER_REVISION_JOBS=1 bash ./tools/generate-driver-agent-revisions.sh --platform "$platform" --drivers "$drivers" >/dev/null
    cat internal/db/driver_agent_revisions_gen.go
  )
}

darwin_output="$(run_case darwin/arm64 mariadb,duckdb)"
windows_output="$(run_case windows/amd64 mariadb,duckdb)"

darwin_file="$(mktemp "${TMPDIR:-/tmp}/gonavi-darwin-revisions.XXXXXX")"
windows_file="$(mktemp "${TMPDIR:-/tmp}/gonavi-windows-revisions.XXXXXX")"
cleanup() {
  rm -f "$darwin_file" "$windows_file"
}
trap cleanup EXIT

printf '%s\n' "$darwin_output" >"$darwin_file"
printf '%s\n' "$windows_output" >"$windows_file"

darwin_mariadb="$(extract_revision "$darwin_file" mariadb)"
windows_mariadb="$(extract_revision "$windows_file" mariadb)"
if [[ -z "$darwin_mariadb" || -z "$windows_mariadb" ]]; then
  echo "expected mariadb revision to be generated for both platforms" >&2
  exit 1
fi
if [[ "$darwin_mariadb" == "$windows_mariadb" ]]; then
  echo "expected mariadb revision to differ between darwin/arm64 and windows/amd64, got identical value: $darwin_mariadb" >&2
  exit 1
fi

darwin_duckdb="$(extract_revision "$darwin_file" duckdb)"
windows_duckdb="$(extract_revision "$windows_file" duckdb)"
if [[ -z "$darwin_duckdb" || -z "$windows_duckdb" ]]; then
  echo "expected duckdb revision to be generated for both platforms" >&2
  exit 1
fi
if [[ "$darwin_duckdb" == "$windows_duckdb" ]]; then
  echo "expected duckdb revision to differ between darwin/arm64 and windows/amd64, got identical value: $darwin_duckdb" >&2
  exit 1
fi

echo "generate-driver-agent-revisions platform test passed"
