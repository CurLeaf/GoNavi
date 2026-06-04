#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
用法：
  ./tools/verify-driver-agent-revisions.sh --assets-dir <目录> --platform <GOOS/GOARCH> --drivers <列表>

说明：
  校验已构建 driver-agent 资产返回的 agentRevision 是否等于当前源码生成的 revision。
EOF
}

assets_dir=""
target_platform=""
driver_csv=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --assets-dir)
      assets_dir="${2:-}"
      shift 2
      ;;
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
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$assets_dir" || -z "$target_platform" || -z "$driver_csv" ]]; then
  usage >&2
  exit 1
fi
if [[ "$target_platform" != */* ]]; then
  echo "--platform 参数格式错误，应为 GOOS/GOARCH，例如 darwin/arm64" >&2
  exit 1
fi

goos="${target_platform%%/*}"
goarch="${target_platform##*/}"
platform_dir="Unknown"
case "$goos" in
  windows) platform_dir="Windows" ;;
  darwin) platform_dir="MacOS" ;;
  linux) platform_dir="Linux" ;;
esac

normalize_driver() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$value" in
    doris|diros) echo "diros" ;;
    opengauss|open_gauss|open-gauss) echo "opengauss" ;;
    elasticsearch|elastic) echo "elasticsearch" ;;
    mariadb|oceanbase|starrocks|sphinx|sqlserver|sqlite|duckdb|dameng|kingbase|highgo|vastbase|iris|mongodb|tdengine|clickhouse)
      echo "$value"
      ;;
    *)
      return 1
      ;;
  esac
}

public_driver_name() {
  case "$1" in
    diros) echo "doris" ;;
    *) echo "$1" ;;
  esac
}

expected_revision_for() {
  local target="$1"
  awk -v target="$target" '
    $0 ~ "\"" target "\"" {
      if (match($0, /"src-[^"]+"/)) {
        value=substr($0, RSTART + 1, RLENGTH - 2)
        print value
        exit
      }
    }
  ' internal/db/driver_agent_revisions_gen.go
}

agent_path_for() {
  local driver="$1"
  local public_name asset
  public_name="$(public_driver_name "$driver")"
  asset="${public_name}-driver-agent-${goos}-${goarch}"
  if [[ "$goos" == "windows" ]]; then
    asset="${asset}.exe"
  fi
  printf '%s\n' "${assets_dir%/}/${platform_dir}/${asset}"
}

probe_agent_revision() {
  local agent_path="$1"
  local request
  request='{"id":1,"method":"metadata"}'
  printf '%s\n' "$request" | "$agent_path" | python3 -c '
import json
import sys

line = sys.stdin.readline()
payload = json.loads(line)
data = payload.get("data") or {}
print(data.get("agentRevision", ""))
'
}

declare -a raw_drivers=()
IFS=',' read -r -a raw_drivers <<<"$driver_csv"

failed=0
for raw_driver in "${raw_drivers[@]}"; do
  [[ -n "$raw_driver" ]] || continue
  driver="$(normalize_driver "$raw_driver")"
  if [[ "$driver" == "duckdb" && "$goos" == "windows" && "$goarch" != "amd64" ]]; then
    echo "⚠️  跳过 duckdb revision 校验（$target_platform 不构建 agent）"
    continue
  fi

  expected="$(expected_revision_for "$driver")"
  if [[ -z "$expected" ]]; then
    echo "❌ $driver 缺少期望 revision"
    failed=1
    continue
  fi

  agent_path="$(agent_path_for "$driver")"
  if [[ ! -f "$agent_path" ]]; then
    echo "❌ $driver 缺少 driver-agent 资产：$agent_path"
    failed=1
    continue
  fi
  chmod +x "$agent_path" 2>/dev/null || true

  actual="$(probe_agent_revision "$agent_path" || true)"
  if [[ "$actual" != "$expected" ]]; then
    echo "❌ $driver driver-agent revision 不匹配：asset=$agent_path actual=${actual:-空} expected=$expected"
    failed=1
    continue
  fi
  echo "✅ $driver driver-agent revision 校验通过：$actual"
done

exit "$failed"
