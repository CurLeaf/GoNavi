#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
用法：
  ./tools/validate-driver-release-manifest.sh --commit <ref> --manifest <path>

说明：
  校验已发布 driver release manifest 中记录的每个 driver revision，
  是否与指定源码提交在对应平台上重新生成出的 revision 完全一致。
EOF
}

source_commit=""
manifest_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit)
      source_commit="${2:-}"
      shift 2
      ;;
    --manifest)
      manifest_path="${2:-}"
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

if [[ -z "$source_commit" || -z "$manifest_path" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -f "$manifest_path" ]]; then
  echo "manifest 不存在：$manifest_path" >&2
  exit 1
fi

if ! git rev-parse --verify "${source_commit}^{commit}" >/dev/null 2>&1; then
  echo "无法解析源码提交：$source_commit" >&2
  exit 1
fi

extract_revision() {
  local file="$1"
  local driver="$2"
  awk -v target="$driver" '
    $0 ~ "\"" target "\"" {
      if (match($0, /"src-[^"]+"/)) {
        print substr($0, RSTART + 1, RLENGTH - 2)
        exit
      }
    }
  ' "$file"
}

normalize_driver() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$value" in
    doris|diros) echo "diros" ;;
    *) echo "$value" ;;
  esac
}

worktree="$(mktemp -d "${TMPDIR:-/tmp}/gonavi-driver-manifest.XXXXXX")"
cleanup() {
  git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$worktree"
}
trap cleanup EXIT

git worktree add --detach "$worktree" "${source_commit}^{commit}" >/dev/null

python3 - "$manifest_path" "$worktree" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1]).resolve()
worktree = Path(sys.argv[2]).resolve()

with manifest_path.open("r", encoding="utf-8") as fh:
    manifest = json.load(fh)

assets = manifest.get("assets") or {}
if not isinstance(assets, dict) or not assets:
    raise SystemExit("manifest assets 为空")

platforms = sorted({str(meta.get("platform") or "").strip() for meta in assets.values() if str(meta.get("platform") or "").strip()})
if not platforms:
    raise SystemExit("manifest 未包含平台信息")

def normalize_driver(driver: str) -> str:
    value = str(driver or "").strip().lower()
    if value == "doris":
        return "diros"
    return value


def parse_revision_file(file_path: Path):
    import re
    text = file_path.read_text(encoding="utf-8")
    revisions = {}
    for match in re.finditer(r'"([^"]+)"\s*:\s*"([^"]+)"', text):
        revisions[match.group(1)] = match.group(2)
    return revisions

drivers_by_platform = {}
for meta in assets.values():
    platform = str(meta.get("platform") or "").strip()
    driver = normalize_driver(meta.get("driver") or meta.get("driverType"))
    if platform and driver:
        drivers_by_platform.setdefault(platform, set()).add(driver)

revision_maps = {}
for platform in platforms:
    command = ["bash", "./tools/generate-driver-agent-revisions.sh", "--platform", platform]
    platform_drivers = sorted(drivers_by_platform.get(platform) or [])
    if platform_drivers:
        command.extend(["--drivers", ",".join(platform_drivers)])
    subprocess.run(command, cwd=worktree, check=True, stdout=subprocess.DEVNULL)
    revision_maps[platform] = parse_revision_file(worktree / "internal/db/driver_agent_revisions_gen.go")

mismatches = []
for asset_name, meta in sorted(assets.items()):
    driver = normalize_driver(meta.get("driver") or meta.get("driverType"))
    platform = str(meta.get("platform") or "").strip()
    published_revision = str(meta.get("revision") or "").strip()
    expected_revision = (revision_maps.get(platform) or {}).get(driver, "")
    if not expected_revision:
        mismatches.append((asset_name, platform, driver, published_revision, "<missing>"))
        continue
    if published_revision != expected_revision:
        mismatches.append((asset_name, platform, driver, published_revision, expected_revision))

if mismatches:
    print("published driver release manifest 与源码重算 revision 不一致：", file=sys.stderr)
    for asset_name, platform, driver, published_revision, expected_revision in mismatches:
        print(
            f"  - {asset_name} [{platform}/{driver}] published={published_revision} expected={expected_revision}",
            file=sys.stderr,
        )
    raise SystemExit(1)

print(f"manifest validation passed: {len(assets)} assets")
PY
