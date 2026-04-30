#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEFAULT_DRIVERS=(mariadb oceanbase doris sphinx sqlserver sqlite duckdb dameng kingbase highgo vastbase opengauss mongodb tdengine clickhouse)
DEFAULT_PLATFORMS=(darwin/amd64 darwin/arm64 windows/amd64 windows/arm64 linux/amd64 linux/arm64)

usage() {
  cat <<'EOF'
用法：
  ./build-driver-agents.sh [选项]

选项：
  --drivers <列表>      指定驱动列表（逗号分隔），例如：kingbase,mongodb
  --platform <目标>      目标平台：current、all、GOOS/GOARCH，或逗号分隔列表
                        默认 current（当前 Go 环境）
  --out-dir <目录>      输出目录根路径，默认：dist/driver-agents
  --bundle-name <文件名> 驱动总包 zip 名称，默认：GoNavi-DriverAgents.zip
  --strict              任一驱动构建失败即中断（默认失败后继续，最后汇总）
  -h, --help            显示帮助

示例：
  ./build-driver-agents.sh
  ./build-driver-agents.sh --drivers kingbase
  ./build-driver-agents.sh --platform windows/amd64 --drivers kingbase,mongodb
  ./build-driver-agents.sh --platform all
  ./build-driver-agents.sh --platform darwin/arm64,windows/amd64,linux/amd64
EOF
}

normalize_driver() {
  local name
  name="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$name" in
    doris|diros) echo "doris" ;;
    open_gauss|open-gauss) echo "opengauss" ;;
    mariadb|oceanbase|sphinx|sqlserver|sqlite|duckdb|dameng|kingbase|highgo|vastbase|opengauss|mongodb|tdengine|clickhouse)
      echo "$name"
      ;;
    *)
      return 1
      ;;
  esac
}

build_driver_name() {
  case "$1" in
    doris) echo "diros" ;;
    *) echo "$1" ;;
  esac
}

platform_dir_name() {
  case "$1" in
    windows) echo "Windows" ;;
    darwin) echo "MacOS" ;;
    linux) echo "Linux" ;;
    *) echo "Unknown" ;;
  esac
}

current_platform() {
  echo "$(go env GOOS)/$(go env GOARCH)"
}

append_platform() {
  local candidate
  candidate="$1"
  if [[ "$platform_seen" == *"|$candidate|"* ]]; then
    return 0
  fi
  platforms+=("$candidate")
  platform_seen="${platform_seen}${candidate}|"
}

normalize_platform() {
  local value goos goarch platform_dir
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$value" in
    current|"")
      current_platform
      ;;
    */*)
      goos="${value%%/*}"
      goarch="${value##*/}"
      platform_dir="$(platform_dir_name "$goos")"
      if [[ -z "$goos" || -z "$goarch" || "$platform_dir" == "Unknown" ]]; then
        return 1
      fi
      echo "$goos/$goarch"
      ;;
    *)
      return 1
      ;;
  esac
}

zip_bundle() {
  local bundle_zip_path="$1"
  local bundle_stage_dir="$2"
  local -a bundle_dirs=()
  local dir

  for dir in "$bundle_stage_dir"/*; do
    [[ -d "$dir" ]] || continue
    bundle_dirs+=("$(basename "$dir")")
  done

  if [[ ${#bundle_dirs[@]} -eq 0 ]]; then
    echo "❌ 驱动总包 staging 目录为空。"
    exit 1
  fi

  rm -f "$bundle_zip_path"
  if command -v zip >/dev/null 2>&1; then
    (
      cd "$bundle_stage_dir"
      zip -qry "$bundle_zip_path" "${bundle_dirs[@]}"
    )
  elif command -v python3 >/dev/null 2>&1; then
    BUNDLE_STAGE_DIR="$bundle_stage_dir" BUNDLE_ZIP_PATH="$bundle_zip_path" python3 - <<'PY'
import os
import zipfile
from pathlib import Path

stage = Path(os.environ["BUNDLE_STAGE_DIR"])
target = Path(os.environ["BUNDLE_ZIP_PATH"])
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in stage.rglob("*"):
        if path.is_file():
            zf.write(path, path.relative_to(stage).as_posix())
PY
  else
    echo "❌ 未找到 zip 或 python3，无法生成驱动总包 zip。"
    exit 1
  fi
}

join_by_comma() {
  local IFS=,
  echo "$*"
}

driver_csv=""
target_platform=""
out_root="dist/driver-agents"
bundle_name="GoNavi-DriverAgents.zip"
strict_mode="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --drivers)
      driver_csv="${2:-}"
      shift 2
      ;;
    --platform)
      target_platform="${2:-}"
      shift 2
      ;;
    --out-dir)
      out_root="${2:-}"
      shift 2
      ;;
    --bundle-name)
      bundle_name="${2:-}"
      shift 2
      ;;
    --strict)
      strict_mode="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "❌ 未知参数：$1"
      usage
      exit 1
      ;;
  esac
done

if ! command -v go >/dev/null 2>&1; then
  echo "❌ 未找到 Go，请先安装 Go 并确保 go 在 PATH 中。"
  exit 1
fi

declare -a drivers=()
if [[ -n "$driver_csv" ]]; then
  IFS=',' read -r -a raw_drivers <<<"$driver_csv"
  for item in "${raw_drivers[@]}"; do
    normalized="$(normalize_driver "$item")" || {
      echo "❌ 不支持的驱动：$item"
      exit 1
    }
    drivers+=("$normalized")
  done
else
  drivers=("${DEFAULT_DRIVERS[@]}")
fi
revision_driver_csv="$(join_by_comma "${drivers[@]}")"

declare -a platforms=()
platform_seen="|"
if [[ -z "$target_platform" ]]; then
  target_platform="current"
fi
IFS=',' read -r -a raw_platforms <<<"$target_platform"
for item in "${raw_platforms[@]}"; do
  normalized_platform="$(printf '%s' "$item" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  if [[ "$normalized_platform" == "all" ]]; then
    for default_platform in "${DEFAULT_PLATFORMS[@]}"; do
      append_platform "$default_platform"
    done
    continue
  fi
  normalized_platform="$(normalize_platform "$item")" || {
    echo "❌ --platform 参数格式错误，应为 current、all、GOOS/GOARCH 或逗号分隔列表，例如 darwin/arm64,windows/amd64"
    exit 1
  }
  append_platform "$normalized_platform"
done

if [[ ${#platforms[@]} -eq 0 ]]; then
  echo "❌ 未指定有效目标平台。"
  exit 1
fi

mkdir -p "$out_root"
out_root_abs="$(cd "$out_root" && pwd)"
bundle_stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/gonavi-driver-bundle.XXXXXX")"

cleanup() {
  rm -rf "$bundle_stage_dir"
}
trap cleanup EXIT

if [[ ${#platforms[@]} -eq 1 ]]; then
  single_platform="${platforms[0]}"
  single_platform_key="${single_platform/\//-}"
  single_output_dir="${out_root%/}/$single_platform_key"
  mkdir -p "$single_output_dir"
  bundle_zip_path="$(cd "$single_output_dir" && pwd)/$bundle_name"
else
  bundle_zip_path="$out_root_abs/$bundle_name"
fi

declare -a built_assets=()
declare -a failed_drivers=()
declare -a skipped_drivers=()

echo "🚀 开始构建 optional-driver-agent"
echo "   平台：${platforms[*]}"
echo "   输出根目录：$out_root_abs"
echo "   驱动列表：${drivers[*]}"

for platform in "${platforms[@]}"; do
  goos="${platform%%/*}"
  goarch="${platform##*/}"
  platform_key="${goos}-${goarch}"
  platform_dir="$(platform_dir_name "$goos")"
  output_dir="${out_root%/}/${platform_key}"
  bundle_platform_dir="$bundle_stage_dir/$platform_dir"

  mkdir -p "$output_dir" "$bundle_platform_dir"
  output_dir_abs="$(cd "$output_dir" && pwd)"

  echo ""
  echo "🧭 生成 driver-agent revision 指纹：$platform"
  "$SCRIPT_DIR/tools/generate-driver-agent-revisions.sh" --platform "$platform" --drivers "$revision_driver_csv"

  for driver in "${drivers[@]}"; do
    if [[ "$driver" == "duckdb" && "$goos" == "windows" && "$goarch" != "amd64" ]]; then
      echo "⚠️  跳过 duckdb（$platform 仅支持 windows/amd64）"
      skipped_drivers+=("duckdb($platform)")
      continue
    fi

    build_driver="$(build_driver_name "$driver")"
    tag="gonavi_${build_driver}_driver"
    asset_name="${driver}-driver-agent-${goos}-${goarch}"
    if [[ "$goos" == "windows" ]]; then
      asset_name="${asset_name}.exe"
    fi
    output_path="$output_dir_abs/$asset_name"

    cgo_enabled=0
    if [[ "$driver" == "duckdb" ]]; then
      cgo_enabled=1
    fi

    echo "🔧 构建 $driver -> $asset_name (platform=$platform, tag=$tag, CGO_ENABLED=$cgo_enabled)"
    set +e
    CGO_ENABLED="$cgo_enabled" GOOS="$goos" GOARCH="$goarch" GOTOOLCHAIN=auto \
      go build -tags "$tag" -trimpath -ldflags "-s -w" -o "$output_path" ./cmd/optional-driver-agent
    build_exit=$?
    set -e

    if [[ $build_exit -ne 0 ]]; then
      echo "❌ 构建失败：$driver ($platform)"
      failed_drivers+=("$driver($platform)")
      if [[ "$strict_mode" == "true" ]]; then
        exit $build_exit
      fi
      continue
    fi

    cp "$output_path" "$bundle_platform_dir/$asset_name"
    built_assets+=("$platform_dir/$asset_name")
  done
done

if [[ ${#built_assets[@]} -eq 0 ]]; then
  echo "❌ 未成功构建任何驱动代理。"
  exit 1
fi

zip_bundle "$bundle_zip_path" "$bundle_stage_dir"

echo ""
echo "✅ 构建完成"
echo "   单文件输出根目录：$out_root_abs"
echo "   驱动总包：$bundle_zip_path"
echo "   已构建：${built_assets[*]}"
if [[ ${#skipped_drivers[@]} -gt 0 ]]; then
  echo "   已跳过：${skipped_drivers[*]}"
fi
if [[ ${#failed_drivers[@]} -gt 0 ]]; then
  echo "⚠️  构建失败驱动：${failed_drivers[*]}"
  exit 2
fi
