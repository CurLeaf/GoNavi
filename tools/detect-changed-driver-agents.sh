#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"
SCRIPT_DIR_WINDOWS="$(pwd -W 2>/dev/null || true)"
SCRIPT_DIR_WINDOWS="${SCRIPT_DIR_WINDOWS//\\//}"

DEFAULT_DRIVERS=(mariadb oceanbase doris starrocks sphinx sqlserver sqlite duckdb dameng kingbase highgo vastbase opengauss mongodb tdengine clickhouse)
TARGET_PLATFORMS=(darwin/amd64 darwin/arm64 windows/amd64 windows/arm64 linux/amd64)

usage() {
  cat <<'EOF'
用法：
  ./tools/detect-changed-driver-agents.sh --base <ref> [--head <ref>]

输出：
  逗号分隔的 driver-agent 列表；没有 driver-agent 相关变更时输出空行。

说明：
  通过 go list -deps 计算每个 driver-agent 的真实源码依赖，再与 git diff 文件求交集。
  如果无法解析基准或依赖分析失败，会保守输出全部 driver。
EOF
}

join_drivers() {
  local IFS=,
  echo "$*"
}

all_drivers_csv() {
  join_drivers "${DEFAULT_DRIVERS[@]}"
}

is_dependency_source_file() {
  case "$1" in
    *.go|*.c|*.cc|*.cpp|*.cxx|*.h|*.hpp|*.m|*.mm|*.s|*.S|*.syso)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

normalize_driver() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$value" in
    doris|diros) echo "doris" ;;
    open_gauss|open-gauss) echo "opengauss" ;;
    mariadb|oceanbase|starrocks|sphinx|sqlserver|sqlite|duckdb|dameng|kingbase|highgo|vastbase|opengauss|mongodb|tdengine|clickhouse)
      echo "$value"
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

driver_build_tags() {
  local driver="$1"
  local platform="$2"
  local goos="${platform%%/*}"
  local goarch="${platform##*/}"
  local build_driver tag
  build_driver="$(build_driver_name "$driver")"
  tag="gonavi_${build_driver}_driver"
  if [[ "$driver" == "duckdb" && "$goos" == "windows" && "$goarch" == "amd64" ]]; then
    tag="$tag duckdb_use_lib"
  fi
  echo "$tag"
}

all_driver_build_tags() {
  local platform="$1"
  local -a tags=()
  local driver
  for driver in "${DEFAULT_DRIVERS[@]}"; do
    tags+=("$(driver_build_tags "$driver" "$platform")")
  done
  local IFS=" "
  echo "${tags[*]}"
}

driver_cgo_enabled() {
  # Detection only needs the Go dependency graph; keeping CGO off avoids
  # cross-platform cgo toolchain requirements in the Ubuntu detection job.
  echo 0
}

relative_repo_path() {
  local path="$1"
  path="${path//\\//}"
  case "$path" in
    "$SCRIPT_DIR"/*)
      path="${path#$SCRIPT_DIR/}"
      ;;
  esac
  if [[ -n "$SCRIPT_DIR_WINDOWS" ]]; then
    case "$path" in
      "$SCRIPT_DIR_WINDOWS"/*)
        path="${path#$SCRIPT_DIR_WINDOWS/}"
        ;;
    esac
  fi
  path="${path#./}"
  printf '%s\n' "$path"
}

add_analysis_platform() {
  local platform="$1"
  if [[ "$analysis_platform_seen" == *"|$platform|"* ]]; then
    return 0
  fi
  analysis_platforms+=("$platform")
  analysis_platform_seen="${analysis_platform_seen}${platform}|"
}

add_forced_driver() {
  local driver
  driver="$(normalize_driver "$1")" || return 0
  if [[ "$forced_driver_seen" == *"|$driver|"* ]]; then
    return 0
  fi
  forced_changed_drivers+=("$driver")
  forced_driver_seen="${forced_driver_seen}${driver}|"
}

list_dependency_files() {
  local tags="$1"
  local cgo_enabled="$2"
  local goos="$3"
  local goarch="$4"
  local output="$5"

  CGO_ENABLED="$cgo_enabled" GOOS="$goos" GOARCH="$goarch" GOTOOLCHAIN=auto \
    go list -deps \
      -tags "$tags" \
      -f '{{if and (not .Standard) .Module.Main}}{{range .GoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .CgoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .CFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .CXXFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .MFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .HFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .SFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{range .SysoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}{{end}}' \
      ./cmd/optional-driver-agent | sort -u >"$output"
}

dependency_union_contains_changed_files() {
  local platform goos goarch tags tmp file rel
  local matched_any=false
  for platform in "${TARGET_PLATFORMS[@]}"; do
    goos="${platform%%/*}"
    goarch="${platform##*/}"
    tags="$(all_driver_build_tags "$platform")"
    tmp="$(mktemp "${TMPDIR:-/tmp}/gonavi-driver-dep-union.XXXXXX")"

    if ! list_dependency_files "$tags" 0 "$goos" "$goarch" "$tmp"; then
      rm -f "$tmp"
      return 2
    fi

    while IFS= read -r file; do
      [[ -n "$file" ]] || continue
      rel="$(relative_repo_path "$file")"
      if [[ -n "${changed_file_set[$rel]:-}" ]]; then
        dependency_matched_platforms["$rel"]="${dependency_matched_platforms[$rel]:-}|$platform|"
        matched_any=true
      fi
    done <"$tmp"

    rm -f "$tmp"
  done
  if [[ "$matched_any" == "true" ]]; then
    return 0
  fi
  return 1
}

base_ref=""
head_ref="HEAD"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      base_ref="${2:-}"
      shift 2
      ;;
    --head)
      head_ref="${2:-}"
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

if [[ -z "$base_ref" ]]; then
  echo "缺少 --base 参数。" >&2
  usage >&2
  exit 1
fi

if [[ "$base_ref" == "all" ]]; then
  all_drivers_csv
  exit 0
fi

if ! git rev-parse --verify "${head_ref}^{commit}" >/dev/null 2>&1; then
  echo "无法解析 head ref：$head_ref" >&2
  exit 1
fi
head_commit="$(git rev-parse "${head_ref}^{commit}")"

if ! git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1; then
  echo "无法解析 base ref：$base_ref；保守构建全部 driver-agent。" >&2
  all_drivers_csv
  exit 0
fi
base_commit="$(git rev-parse "${base_ref}^{commit}")"

declare -A changed_file_set=()
while IFS= read -r -d '' file; do
  file="$(relative_repo_path "$file")"
  [[ -n "$file" ]] || continue
  changed_file_set["$file"]=1
done < <(git diff --name-only -z "$base_commit" "$head_commit")

if [[ ${#changed_file_set[@]} -eq 0 ]]; then
  echo ""
  exit 0
fi

for file in "${!changed_file_set[@]}"; do
  case "$file" in
    go.mod|go.sum|build-driver-agents.sh|tools/compress-driver-artifact.sh|tools/generate-driver-agent-revisions.sh|tools/detect-changed-driver-agents.sh)
      all_drivers_csv
      exit 0
      ;;
  esac
done

declare -a forced_changed_drivers=()
forced_driver_seen="|"
for file in "${!changed_file_set[@]}"; do
  case "$file" in
    internal/db/duckdb_*.go)
      add_forced_driver duckdb
      ;;
  esac
done

has_source_candidate=false
for file in "${!changed_file_set[@]}"; do
  if is_dependency_source_file "$file"; then
    has_source_candidate=true
    break
  fi
done

if [[ "$has_source_candidate" != "true" ]]; then
  echo ""
  exit 0
fi

while IFS= read -r -d '' file; do
  file="$(relative_repo_path "$file")"
  if is_dependency_source_file "$file"; then
    echo "检测到源码依赖候选文件被删除；保守构建全部 driver-agent：$file" >&2
    all_drivers_csv
    exit 0
  fi
done < <(git diff --name-only --diff-filter=D -z "$base_commit" "$head_commit")

declare -A dependency_matched_platforms=()
set +e
dependency_union_contains_changed_files
dependency_union_status=$?
set -e
case "$dependency_union_status" in
  0)
    ;;
  1)
    if [[ ${#forced_changed_drivers[@]} -eq 0 ]]; then
      echo ""
      exit 0
    fi
    ;;
  *)
    echo "分析 driver-agent 依赖全集失败；保守构建全部 driver-agent。" >&2
    all_drivers_csv
    exit 0
    ;;
esac

declare -a analysis_platforms=()
analysis_platform_seen="|"
for file in "${!dependency_matched_platforms[@]}"; do
  matched_platforms="${dependency_matched_platforms[$file]}"
  if [[ "$matched_platforms" == *"|linux/amd64|"* ]]; then
    add_analysis_platform "linux/amd64"
    continue
  fi
  for platform in "${TARGET_PLATFORMS[@]}"; do
    if [[ "$matched_platforms" == *"|$platform|"* ]]; then
      add_analysis_platform "$platform"
    fi
  done
done
if [[ ${#analysis_platforms[@]} -eq 0 ]]; then
  analysis_platforms=("${TARGET_PLATFORMS[@]}")
fi

declare -a changed_drivers=()
driver_seen="|"

add_driver() {
  local driver
  driver="$(normalize_driver "$1")" || return 0
  if [[ "$driver_seen" == *"|$driver|"* ]]; then
    return 0
  fi
  changed_drivers+=("$driver")
  driver_seen="${driver_seen}${driver}|"
}

for driver in "${forced_changed_drivers[@]}"; do
  add_driver "$driver"
done

driver_depends_on_changed_files() {
  local driver="$1"
  local platform="$2"
  local goos="${platform%%/*}"
  local goarch="${platform##*/}"
  local tags cgo_enabled file rel tmp
  tags="$(driver_build_tags "$driver" "$platform")"
  cgo_enabled="$(driver_cgo_enabled "$driver")"
  tmp="$(mktemp "${TMPDIR:-/tmp}/gonavi-driver-deps.XXXXXX")"

  if ! list_dependency_files "$tags" "$cgo_enabled" "$goos" "$goarch" "$tmp"; then
    rm -f "$tmp"
    return 2
  fi

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    rel="$(relative_repo_path "$file")"
    if [[ -n "${changed_file_set[$rel]:-}" ]]; then
      rm -f "$tmp"
      return 0
    fi
  done <"$tmp"

  rm -f "$tmp"
  return 1
}

for driver in "${DEFAULT_DRIVERS[@]}"; do
  driver_changed=false
  for platform in "${analysis_platforms[@]}"; do
    set +e
    driver_depends_on_changed_files "$driver" "$platform"
    status=$?
    set -e
    case "$status" in
      0)
        add_driver "$driver"
        driver_changed=true
        break
        ;;
      1)
        ;;
      *)
        echo "分析 $driver driver-agent 依赖失败；保守构建全部 driver-agent。" >&2
        all_drivers_csv
        exit 0
        ;;
    esac
  done
done

join_drivers "${changed_drivers[@]}"
