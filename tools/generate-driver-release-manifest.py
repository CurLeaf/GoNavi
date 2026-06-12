#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-dir", required=True, help="driver release staging dir that contains standalone driver assets")
    parser.add_argument("--output", required=True, help="manifest json output path")
    return parser.parse_args()


def infer_driver_and_platform(file_name: str):
    suffixes = [
        ("-driver-agent-v1-darwin-amd64", "darwin/amd64"),
        ("-driver-agent-v1-darwin-arm64", "darwin/arm64"),
        ("-driver-agent-v1-linux-amd64", "linux/amd64"),
        ("-driver-agent-v1-windows-amd64.exe", "windows/amd64"),
        ("-driver-agent-v1-windows-arm64.exe", "windows/arm64"),
        ("-driver-agent-v2-darwin-amd64", "darwin/amd64"),
        ("-driver-agent-v2-darwin-arm64", "darwin/arm64"),
        ("-driver-agent-v2-linux-amd64", "linux/amd64"),
        ("-driver-agent-v2-windows-amd64.exe", "windows/amd64"),
        ("-driver-agent-v2-windows-arm64.exe", "windows/arm64"),
        ("-driver-agent-darwin-amd64", "darwin/amd64"),
        ("-driver-agent-darwin-arm64", "darwin/arm64"),
        ("-driver-agent-linux-amd64", "linux/amd64"),
        ("-driver-agent-windows-amd64.exe", "windows/amd64"),
        ("-driver-agent-windows-arm64.exe", "windows/arm64"),
    ]
    for suffix, platform in suffixes:
        if file_name.endswith(suffix):
            driver = file_name[: -len(suffix)]
            return driver, platform
    return None, None


def normalize_driver(driver: str):
    value = str(driver or "").strip().lower()
    if value == "doris":
        return "diros"
    return value


def repo_root():
    return Path(__file__).resolve().parent.parent


def resolve_head_commit(root: Path):
    proc = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=True,
    )
    return proc.stdout.strip()


def parse_revision_file(path: Path):
    revisions = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.startswith('"'):
            continue
        try:
            driver, revision = stripped.rstrip(",").split(":", 1)
        except ValueError:
            continue
        revisions[driver.strip().strip('"')] = revision.strip().strip('"')
    return revisions


def generate_platform_revisions(root: Path, drivers_by_platform):
    if not drivers_by_platform:
        return {}

    with tempfile.TemporaryDirectory(prefix="gonavi-driver-release-manifest-") as tmp:
        worktree = Path(tmp) / "worktree"
        subprocess.run(
            ["git", "worktree", "add", "--detach", str(worktree), "HEAD"],
            cwd=root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        try:
            revision_file = worktree / "internal/db/driver_agent_revisions_gen.go"
            result = {}
            for platform in sorted(drivers_by_platform):
                drivers = sorted({normalize_driver(driver) for driver in drivers_by_platform[platform] if normalize_driver(driver)})
                command = ["bash", "./tools/generate-driver-agent-revisions.sh", "--platform", platform]
                if drivers:
                    command.extend(["--drivers", ",".join(drivers)])
                subprocess.run(
                    command,
                    cwd=worktree,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=True,
                )
                result[platform] = parse_revision_file(revision_file)
            return result
        finally:
            subprocess.run(
                ["git", "worktree", "remove", "--force", str(worktree)],
                cwd=root,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )


def main():
    args = parse_args()
    assets_dir = Path(args.assets_dir).resolve()
    output_path = Path(args.output).resolve()
    root = repo_root()

    asset_entries = []
    drivers_by_platform = {}
    for child in sorted(assets_dir.rglob("*")):
        if not child.is_file():
            continue
        driver, platform = infer_driver_and_platform(child.name)
        if not driver or not platform:
            continue
        if child.stat().st_size == 0:
            raise RuntimeError(f"{child.name}: asset is empty")
        asset_entries.append((child, driver, platform))
        drivers_by_platform.setdefault(platform, set()).add(driver)

    revisions_by_platform = generate_platform_revisions(root, drivers_by_platform)

    manifest = {
        "schemaVersion": 1,
        "generatedFrom": os.environ.get("GITHUB_SHA", "").strip() or resolve_head_commit(root),
        "assets": {},
    }

    for child, driver, platform in asset_entries:
        normalized_driver = normalize_driver(driver)
        revision = str((revisions_by_platform.get(platform) or {}).get(normalized_driver) or "").strip()
        if not revision:
            raise RuntimeError(f"{child.name}: missing revision for {platform}/{normalized_driver}")
        manifest["assets"][child.name] = {
            "driver": driver,
            "driverType": driver,
            "platform": platform,
            "revision": revision,
            "size": child.stat().st_size,
            "sha256": hashlib.sha256(child.read_bytes()).hexdigest(),
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote manifest: {output_path}")
    print(f"asset count: {len(manifest['assets'])}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        command = exc.cmd if isinstance(exc.cmd, str) else " ".join(exc.cmd)
        stderr = (exc.stderr or "").strip()
        if stderr:
            print(stderr, file=sys.stderr)
        print(f"error: command failed: {command}", file=sys.stderr)
        raise
