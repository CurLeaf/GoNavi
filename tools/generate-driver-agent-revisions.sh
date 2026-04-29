#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

DEFAULT_DRIVERS=(mariadb diros sphinx sqlserver sqlite duckdb dameng kingbase highgo vastbase mongodb tdengine clickhouse)
OUTPUT_FILE="internal/db/driver_agent_revisions_gen.go"

usage() {
  cat <<'EOF'
用法：
  ./tools/generate-driver-agent-revisions.sh [选项]

选项：
  --platform <GOOS/GOARCH>  按目标平台解析 Go build tags，默认使用当前 Go 环境
  --drivers <列表>          指定驱动列表（逗号分隔），默认生成所有 optional driver
  -h, --help                显示帮助
EOF
}

normalize_driver() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$value" in
    doris|diros) echo "diros" ;;
    mariadb|diros|sphinx|sqlserver|sqlite|duckdb|dameng|kingbase|highgo|vastbase|mongodb|tdengine|clickhouse)
      echo "$value"
      ;;
    *)
      return 1
      ;;
  esac
}

build_driver_name() {
  echo "$1"
}

hash_file() {
  local target="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$target" | awk '{print $1}'
    return
  fi
  echo "未找到 sha256sum 或 shasum" >&2
  exit 1
}

should_include_internal_db_file() {
  local driver="$1"
  local identity="$2"

  case "$identity" in
    internal/db/agent_process_stub.go|\
internal/db/agent_process_windows.go|\
internal/db/database.go|\
internal/db/database_optional_factories_full.go|\
internal/db/database_optional_factories_lite.go|\
internal/db/driver_agent_binary_check.go|\
internal/db/driver_support.go|\
internal/db/json_decode.go|\
internal/db/mysql_agent_path.go|\
internal/db/optional_driver_agent_impl.go|\
internal/db/optional_driver_build_full.go|\
internal/db/optional_driver_build_lite.go|\
internal/db/query_value.go|\
internal/db/scan_rows.go|\
internal/db/ssl_mode.go|\
internal/db/timeout.go)
      return 0
      ;;
  esac

  case "$driver:$identity" in
    mariadb:internal/db/mariadb_impl.go|\
diros:internal/db/diros_impl.go|\
diros:internal/db/mysql_impl.go|\
sphinx:internal/db/sphinx_impl.go|\
sphinx:internal/db/mysql_impl.go|\
sqlserver:internal/db/sqlserver_impl.go|\
sqlite:internal/db/sqlite_impl.go|\
duckdb:internal/db/duckdb_impl.go|\
duckdb:internal/db/duckdb_driver_import.go|\
duckdb:internal/db/duckdb_platform_supported.go|\
duckdb:internal/db/duckdb_platform_unsupported.go|\
dameng:internal/db/dameng_impl.go|\
dameng:internal/db/dameng_metadata.go|\
kingbase:internal/db/kingbase_impl.go|\
kingbase:internal/db/kingbase_identifier_utils.go|\
highgo:internal/db/highgo_impl.go|\
vastbase:internal/db/vastbase_impl.go|\
mongodb:internal/db/mongodb_impl.go|\
mongodb:internal/db/mongodb_impl_v1.go|\
tdengine:internal/db/tdengine_impl.go|\
clickhouse:internal/db/clickhouse_impl.go)
      return 0
      ;;
  esac

  return 1
}

should_include_source_file() {
  local driver="$1"
  local identity="$2"
  if [[ "$identity" == internal/db/* ]]; then
    should_include_internal_db_file "$driver" "$identity"
    return
  fi
  return 0
}

target_platform=""
driver_csv=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      target_platform="${2:-}"
      shift 2
      ;;
    --drivers)
      driver_csv="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v go >/dev/null 2>&1; then
  echo "未找到 Go，请先安装 Go 并确保 go 在 PATH 中。" >&2
  exit 1
fi

if [[ -z "$target_platform" ]]; then
  target_platform="$(go env GOOS)/$(go env GOARCH)"
fi
if [[ "$target_platform" != */* ]]; then
  echo "--platform 参数格式错误，应为 GOOS/GOARCH，例如 darwin/arm64" >&2
  exit 1
fi

goos="${target_platform%%/*}"
goarch="${target_platform##*/}"
gomodcache="$(go env GOMODCACHE)"

declare -a drivers=()
if [[ -n "$driver_csv" ]]; then
  IFS=',' read -r -a raw_drivers <<<"$driver_csv"
  for item in "${raw_drivers[@]}"; do
    drivers+=("$(normalize_driver "$item")")
  done
else
  drivers=("${DEFAULT_DRIVERS[@]}")
fi

fingerprint_driver() {
  local driver="$1"
  local build_driver tag cgo_enabled tmp file identity file_hash revision
  build_driver="$(build_driver_name "$driver")"
  tag="gonavi_${build_driver}_driver"
  cgo_enabled=0
  if [[ "$driver" == "duckdb" ]]; then
    cgo_enabled=1
  fi

  tmp="$(mktemp "${TMPDIR:-/tmp}/gonavi-agent-revision.XXXXXX")"
  {
    printf 'driver=%s\n' "$driver"
    printf 'build_tag=%s\n' "$tag"
    printf 'goos=%s\n' "$goos"
    printf 'goarch=%s\n' "$goarch"
  } >"$tmp"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] || continue
    case "$file" in
      "$SCRIPT_DIR"/*)
        identity="${file#$SCRIPT_DIR/}"
        ;;
      "$gomodcache"/*)
        identity="gomod/${file#$gomodcache/}"
        ;;
      *)
        identity="$file"
        ;;
    esac
    if [[ "$identity" == "$OUTPUT_FILE" ]]; then
      continue
    fi
    if ! should_include_source_file "$driver" "$identity"; then
      continue
    fi
    file_hash="$(hash_file "$file")"
    printf '%s  %s\n' "$file_hash" "$identity"
  done < <(
    CGO_ENABLED="$cgo_enabled" GOOS="$goos" GOARCH="$goarch" GOTOOLCHAIN=auto \
      go list -deps \
        -tags "$tag" \
        -f '{{if not .Standard}}{{range .GoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .CgoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{end}}' \
        ./cmd/optional-driver-agent | sort -u
  ) >>"$tmp"

  revision="$(hash_file "$tmp" | cut -c1-16)"
  rm -f "$tmp"
  printf 'src-%s' "$revision"
}

tmp_output="$(mktemp "${TMPDIR:-/tmp}/gonavi-agent-revisions-go.XXXXXX")"
{
  cat <<'EOF'
// Code generated by tools/generate-driver-agent-revisions.sh; DO NOT EDIT.

package db

func init() {
	optionalDriverAgentRevisions = map[string]string{
EOF
  for driver in "${drivers[@]}"; do
    revision="$(fingerprint_driver "$driver")"
    printf '\t\t"%s": "%s",\n' "$driver" "$revision"
  done
  cat <<'EOF'
	}
}
EOF
} >"$tmp_output"

gofmt -w "$tmp_output"

if [[ -f "$OUTPUT_FILE" ]] && cmp -s "$tmp_output" "$OUTPUT_FILE"; then
  rm -f "$tmp_output"
else
  mv "$tmp_output" "$OUTPUT_FILE"
fi

echo "已生成 driver-agent revisions: $OUTPUT_FILE ($goos/$goarch)"
