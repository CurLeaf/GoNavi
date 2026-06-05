#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
用法：
  ./tools/should-force-global-driver-builds.sh --base <ref> --head <ref>

输出：
  true  表示本次变更涉及 driver 构建/发布链路，平台构建阶段必须保留全局驱动重建结果
  false 表示可继续按平台 revision diff 缩小重建范围
EOF
}

base_ref=""
head_ref=""

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

if [[ -z "$base_ref" || -z "$head_ref" ]]; then
  usage >&2
  exit 1
fi

if [[ "$base_ref" == "all" ]]; then
  echo "true"
  exit 0
fi

if ! git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1; then
  echo "无法解析 base ref：$base_ref" >&2
  exit 1
fi
if ! git rev-parse --verify "${head_ref}^{commit}" >/dev/null 2>&1; then
  echo "无法解析 head ref：$head_ref" >&2
  exit 1
fi

while IFS= read -r file; do
  case "$file" in
    .github/workflows/dev-build.yml|\
    .github/workflows/release.yml|\
    build-driver-agents.sh|\
    tools/compress-driver-artifact.sh|\
    tools/detect-changed-driver-agents.sh|\
    tools/diff-driver-agent-revisions.sh|\
    tools/package-driver-release-assets.py|\
    tools/generate-driver-release-manifest.py|\
    tools/validate-driver-release-assets.py|\
    tools/complete-driver-release-assets.py|\
    tools/resolve-driver-release-source.py|\
    tools/validate-driver-release-manifest.sh|\
    tools/should-force-global-driver-builds.sh)
      echo "true"
      exit 0
      ;;
  esac
done < <(git diff --name-only "$base_ref" "$head_ref")

echo "false"
