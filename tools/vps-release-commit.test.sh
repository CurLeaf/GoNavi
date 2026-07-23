#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

ROOT="${TEMP_DIR}/mirror"
SOURCE="${TEMP_DIR}/source"
mkdir -p "${ROOT}/.incoming" "${SOURCE}/app" "${SOURCE}/driver"
printf '%s\n' 'gonavi-download-mirror-v1' > "${ROOT}/.gonavi-mirror-root"
printf '%s' 'portable zip' > "${SOURCE}/app/GoNavi.zip"
printf '%s' 'driver binary' > "${SOURCE}/driver/mysql.exe"

python3 - "${SOURCE}" <<'PY'
import hashlib
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
app = (source / "app/GoNavi.zip").read_bytes()
(source / "app/latest.json").write_text(json.dumps({
    "tagName": "v1.2.3",
    "assets": [{
        "name": "GoNavi.zip",
        "size": len(app),
        "sha256": hashlib.sha256(app).hexdigest(),
    }],
}))
assets = {"mysql.exe": (source / "driver/mysql.exe").stat().st_size}
(source / "driver/version.json").write_text(json.dumps({"tagName": "v1.2.3", "assets": assets}))
(source / "driver/latest.json").write_text(json.dumps({"tagName": "v1.2.3", "assets": assets}))
PY

prepare_stable() {
    local output="$1"
    python3 "${SCRIPT_DIR}/prepare-vps-release-payload.py" \
        --channel stable \
        --app-tag v1.2.3 \
        --app-dir "${SOURCE}/app" \
        --app-manifest "${SOURCE}/app/latest.json" \
        --driver-tag v1.2.3 \
        --driver-dir "${SOURCE}/driver" \
        --driver-version-index "${SOURCE}/driver/version.json" \
        --driver-latest-index "${SOURCE}/driver/latest.json" \
        --output "${output}" >/dev/null
}

mkdir -p "${ROOT}/gonavi/releases/download/v0.9.0" \
    "${ROOT}/drivers/releases/download/v0.9.0"
prepare_stable "${ROOT}/.incoming/stable-1"
bash "${SCRIPT_DIR}/vps-release-commit.sh" \
    "${ROOT}" "${ROOT}/.incoming/stable-1" stable v1.2.3 v1.2.3 >/dev/null

test -f "${ROOT}/gonavi/releases/download/v1.2.3/GoNavi.zip"
test -f "${ROOT}/gonavi/releases/latest/latest.json"
test -f "${ROOT}/drivers/releases/download/v1.2.3/mysql.exe"
test -f "${ROOT}/drivers/releases/latest/GoNavi-DriverAgents-Index.json"
test ! -e "${ROOT}/gonavi/releases/download/v0.9.0"
test ! -e "${ROOT}/drivers/releases/download/v0.9.0"

# Replaying the same immutable release is idempotent.
prepare_stable "${ROOT}/.incoming/stable-2"
bash "${SCRIPT_DIR}/vps-release-commit.sh" \
    "${ROOT}" "${ROOT}/.incoming/stable-2" stable v1.2.3 v1.2.3 >/dev/null

# A checksum failure must not move the mutable pointer.
printf '%s' 'dev payload' > "${SOURCE}/app/GoNavi-dev.zip"
python3 - "${SOURCE}" <<'PY'
import hashlib
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
app = (source / "app/GoNavi-dev.zip").read_bytes()
(source / "app/latest-dev.json").write_text(json.dumps({
    "channel": "dev",
    "version": "dev-abc123",
    "assets": [{
        "name": "GoNavi-dev.zip",
        "size": len(app),
        "sha256": hashlib.sha256(app).hexdigest(),
    }],
}))
PY
python3 "${SCRIPT_DIR}/prepare-vps-release-payload.py" \
    --channel dev \
    --app-tag dev-abc123 \
    --app-dir "${SOURCE}/app" \
    --app-manifest "${SOURCE}/app/latest-dev.json" \
    --output "${ROOT}/.incoming/dev-1" >/dev/null
printf '%s' 'tampered' >> "${ROOT}/.incoming/dev-1/payload/gonavi/dev/releases/download/dev-abc123/GoNavi-dev.zip"
if bash "${SCRIPT_DIR}/vps-release-commit.sh" \
    "${ROOT}" "${ROOT}/.incoming/dev-1" dev dev-abc123 '' >/dev/null 2>&1; then
    echo "expected tampered payload to fail" >&2
    exit 1
fi
test ! -e "${ROOT}/gonavi/dev/releases/latest/latest-dev.json"

echo "vps release commit tests passed"
