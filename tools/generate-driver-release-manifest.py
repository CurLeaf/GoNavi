#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-dir", required=True, help="driver release staging dir that contains standalone driver assets")
    parser.add_argument("--output", required=True, help="manifest json output path")
    return parser.parse_args()


def infer_driver_and_platform(file_name: str):
    suffixes = [
        "-driver-agent-darwin-amd64",
        "-driver-agent-darwin-arm64",
        "-driver-agent-linux-amd64",
        "-driver-agent-windows-amd64.exe",
        "-driver-agent-windows-arm64.exe",
    ]
    for suffix in suffixes:
        if file_name.endswith(suffix):
            driver = file_name[: -len(suffix)]
            if suffix.endswith(".exe"):
                platform = suffix.replace("-driver-agent-", "").removesuffix(".exe")
            else:
                platform = suffix.replace("-driver-agent-", "")
            return driver, platform
    return None, None


def probe_revision(path: Path):
    request = b'{"id":1,"method":"metadata"}\n'
    proc = subprocess.run(
        [str(path)],
        input=request,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        check=True,
    )
    line = proc.stdout.decode("utf-8", errors="replace").strip().splitlines()
    if not line:
        raise RuntimeError(f"{path.name}: metadata response is empty")
    payload = json.loads(line[0])
    data = payload.get("data") or {}
    revision = str(data.get("agentRevision") or "").strip()
    driver_type = str(data.get("driverType") or "").strip()
    if not revision:
        raise RuntimeError(f"{path.name}: metadata agentRevision is empty")
    return driver_type, revision


def main():
    args = parse_args()
    assets_dir = Path(args.assets_dir).resolve()
    output_path = Path(args.output).resolve()

    manifest = {
        "schemaVersion": 1,
        "generatedFrom": os.environ.get("GITHUB_SHA", "").strip(),
        "assets": {},
    }

    for child in sorted(assets_dir.rglob("*")):
        if not child.is_file():
            continue
        driver, platform = infer_driver_and_platform(child.name)
        if not driver or not platform:
            continue
        if child.stat().st_size == 0:
            raise RuntimeError(f"{child.name}: asset is empty")
        driver_type, revision = probe_revision(child)
        manifest["assets"][child.name] = {
            "driver": driver,
            "driverType": driver_type or driver,
            "platform": platform,
            "revision": revision,
            "size": child.stat().st_size,
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote manifest: {output_path}")
    print(f"asset count: {len(manifest['assets'])}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired as exc:
        print(f"error: probe timed out for {exc.cmd}", file=sys.stderr)
        raise
