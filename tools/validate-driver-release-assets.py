#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


MANIFEST_ASSET_NAME = "GoNavi-DriverAgents-Manifest.json"


def github_headers(binary: bool = False):
    headers = {
        "Accept": "application/octet-stream" if binary else "application/vnd.github+json",
        "User-Agent": "GoNavi-CI",
    }
    token = os.environ.get("DRIVER_RELEASE_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_json(url: str):
    req = urllib.request.Request(url, headers=github_headers(False))
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_url(url: str, destination: Path):
    req = urllib.request.Request(url, headers=github_headers(False))
    with urllib.request.urlopen(req, timeout=120) as resp, open(destination, "wb") as out:
        shutil.copyfileobj(resp, out)


def load_release(repo: str, tag: str):
    owner_repo = repo.strip()
    if not owner_repo:
        raise ValueError("repo is required")
    if tag == "latest":
        url = f"https://api.github.com/repos/{owner_repo}/releases/latest"
    else:
        url = f"https://api.github.com/repos/{owner_repo}/releases/tags/{urllib.parse.quote(tag, safe='')}"
    return fetch_json(url)


def asset_map(release: dict):
    result = {}
    for asset in release.get("assets", []):
        name = str(asset.get("name") or "").strip()
        if name:
            result[name] = asset
    return result


def asset_sha256_digest(asset: dict):
    digest = str(asset.get("digest") or "").strip().lower()
    prefix = "sha256:"
    if digest.startswith(prefix):
        value = digest[len(prefix) :].strip()
        if value:
            return value
    return ""


def infer_asset_path(name: str):
    trimmed = str(name or "").strip()
    if not trimmed:
        return None
    if trimmed == "duckdb.dll":
        return "Windows/duckdb.dll"
    if trimmed == "duckdb-driver.zip":
        return None
    if (
        trimmed.endswith("-driver-agent-windows-amd64.exe")
        or trimmed.endswith("-driver-agent-windows-arm64.exe")
        or trimmed.endswith("-driver-agent-v1-windows-amd64.exe")
        or trimmed.endswith("-driver-agent-v1-windows-arm64.exe")
        or trimmed.endswith("-driver-agent-v2-windows-amd64.exe")
        or trimmed.endswith("-driver-agent-v2-windows-arm64.exe")
    ):
        return f"Windows/{trimmed}"
    if (
        trimmed.endswith("-driver-agent-darwin-amd64")
        or trimmed.endswith("-driver-agent-darwin-arm64")
        or trimmed.endswith("-driver-agent-v1-darwin-amd64")
        or trimmed.endswith("-driver-agent-v1-darwin-arm64")
        or trimmed.endswith("-driver-agent-v2-darwin-amd64")
        or trimmed.endswith("-driver-agent-v2-darwin-arm64")
    ):
        return f"MacOS/{trimmed}"
    if (
        trimmed.endswith("-driver-agent-linux-amd64")
        or trimmed.endswith("-driver-agent-v1-linux-amd64")
        or trimmed.endswith("-driver-agent-v2-linux-amd64")
    ):
        return f"Linux/{trimmed}"
    return None


def normalize_machine(value: str):
    machine = str(value or "").strip().lower()
    if machine in {"x86_64", "amd64"}:
        return "amd64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    return machine


def current_runtime_platform():
    system = platform.system().lower()
    if system == "darwin":
        goos = "darwin"
    elif system == "windows":
        goos = "windows"
    elif system == "linux":
        goos = "linux"
    else:
        return ""
    goarch = normalize_machine(platform.machine())
    if not goarch:
        return ""
    return f"{goos}/{goarch}"


def sha256_file(path: Path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def probe_metadata_revision(path: Path):
    current_mode = path.stat().st_mode
    path.chmod(current_mode | stat.S_IXUSR)
    proc = subprocess.run(
        [str(path)],
        input=b'{"id":1,"method":"metadata"}\n',
        capture_output=True,
        timeout=20,
        check=True,
    )
    if not proc.stdout:
        raise RuntimeError(f"{path.name}: metadata output is empty")
    payload = json.loads(proc.stdout.decode("utf-8"))
    return str(((payload.get("data") or {}).get("agentRevision") or "")).strip()


def validate_release_assets(release: dict, manifest: dict, runtime_platform=None):
    assets = asset_map(release)
    manifest_assets = manifest.get("assets") or {}
    if not isinstance(manifest_assets, dict) or not manifest_assets:
        raise RuntimeError("manifest assets is empty")

    if runtime_platform is None:
        runtime_platform = current_runtime_platform()
    runtime_platform = str(runtime_platform or "").strip().lower()

    mismatches = []
    skipped = []
    with tempfile.TemporaryDirectory(prefix="gonavi-release-assets-") as tmp:
        tmp_root = Path(tmp)
        for name, meta in sorted(manifest_assets.items()):
            if name == MANIFEST_ASSET_NAME:
                continue
            asset = assets.get(name)
            if asset is None:
                mismatches.append((name, "missing_release_asset", "", "present in manifest"))
                continue

            expected_sha = str(meta.get("sha256") or "").strip().lower()
            expected_revision = str(meta.get("revision") or "").strip()
            asset_platform = str(meta.get("platform") or "").strip().lower()

            local_path = None
            actual_sha = asset_sha256_digest(asset)
            if expected_sha and not actual_sha:
                local_path = tmp_root / name
                download_url(str(asset.get("browser_download_url") or "").strip(), local_path)
                actual_sha = sha256_file(local_path).lower()
            if expected_sha and actual_sha != expected_sha:
                mismatches.append((name, "sha256", actual_sha, expected_sha))
                continue

            path_hint = infer_asset_path(name)
            if path_hint is None:
                skipped.append(name)
                continue

            if expected_revision and asset_platform == runtime_platform:
                if local_path is None:
                    local_path = tmp_root / name
                    download_url(str(asset.get("browser_download_url") or "").strip(), local_path)
                actual_revision = probe_metadata_revision(local_path)
                if actual_revision != expected_revision:
                    mismatches.append((name, "revision", actual_revision, expected_revision))

    return mismatches, skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="Syngnat/GoNavi-DriverAgents")
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()

    release = load_release(args.repo, args.tag)
    assets = asset_map(release)
    manifest_asset = assets.get(MANIFEST_ASSET_NAME)
    if manifest_asset is None:
        raise SystemExit(f"release {args.repo}@{args.tag} missing {MANIFEST_ASSET_NAME}")

    with tempfile.TemporaryDirectory(prefix="gonavi-release-manifest-") as tmp:
        manifest_path = Path(tmp) / MANIFEST_ASSET_NAME
        download_url(str(manifest_asset.get("browser_download_url") or "").strip(), manifest_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    mismatches, skipped = validate_release_assets(release, manifest)
    if mismatches:
        print("published driver release assets mismatch manifest:", file=sys.stderr)
        for name, field, actual, expected in mismatches:
            print(f"  - {name} [{field}] actual={actual or '<empty>'} expected={expected or '<empty>'}", file=sys.stderr)
        raise SystemExit(1)

    checked = len((manifest.get("assets") or {})) - len(skipped)
    print(f"driver release assets validation passed: checked={checked} skipped={len(skipped)}")
    if skipped:
        print("skipped assets: " + ", ".join(sorted(skipped)))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(f"http error: {exc.code}", file=sys.stderr)
        raise
