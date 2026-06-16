#!/usr/bin/env python3

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


COMMIT_LINK_RE = re.compile(r"/commit/([0-9a-f]{40})(?:\b|/)")
FULL_SHA_RE = re.compile(r"\b([0-9a-f]{40})\b")
MANIFEST_ASSET_NAME = "GoNavi-DriverAgents-Manifest.json"


def github_headers():
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "GoNavi-CI",
    }
    token = os.environ.get("DRIVER_RELEASE_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_json(url):
    request = urllib.request.Request(url, headers=github_headers())
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def download_asset(asset, destination):
    headers = github_headers()
    headers["Accept"] = "application/octet-stream"
    request = urllib.request.Request(asset["url"], headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        with open(destination, "wb") as output:
            output.write(response.read())


def load_release(repo, tag):
    owner_repo = repo.strip()
    if not owner_repo:
        raise ValueError("repo is required")

    if tag == "latest":
        url = f"https://api.github.com/repos/{owner_repo}/releases/latest"
    else:
        url = (
            f"https://api.github.com/repos/{owner_repo}/releases/tags/"
            f"{urllib.parse.quote(tag, safe='')}"
        )

    try:
        return fetch_json(url)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print(f"warning: release {owner_repo}@{tag} not found", file=sys.stderr)
            return None
        print(
            f"warning: failed to load release {owner_repo}@{tag}: HTTP {exc.code}",
            file=sys.stderr,
        )
        return None
    except Exception as exc:  # pragma: no cover - defensive logging path
        print(f"warning: failed to load release {owner_repo}@{tag}: {exc}", file=sys.stderr)
        return None


def extract_source_commit(release):
    if not isinstance(release, dict):
        return None

    body = str(release.get("body") or "")
    for pattern in (COMMIT_LINK_RE, FULL_SHA_RE):
        match = pattern.search(body)
        if match:
            return match.group(1)

    target_commitish = str(release.get("target_commitish") or "").strip()
    if FULL_SHA_RE.fullmatch(target_commitish):
        return target_commitish

    return None


def find_manifest_asset(release):
    if not isinstance(release, dict):
        return None

    for asset in release.get("assets", []):
        if str(asset.get("name") or "").strip() == MANIFEST_ASSET_NAME:
            return asset
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="Syngnat/GoNavi-DriverAgents")
    parser.add_argument("--tag", required=True, help="release tag name such as dev-latest or v1.0.0")
    parser.add_argument("--manifest-output", help="optional path to download the published revision manifest asset")
    args = parser.parse_args()

    release = load_release(args.repo, args.tag)
    if release is None:
        return 0

    if args.manifest_output:
        manifest_path = os.path.abspath(args.manifest_output)
        manifest_asset = find_manifest_asset(release)
        if manifest_asset is None:
            if os.path.exists(manifest_path):
                os.remove(manifest_path)
            print(
                f"warning: release {args.repo}@{args.tag} does not expose {MANIFEST_ASSET_NAME}",
                file=sys.stderr,
            )
        else:
            os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
            download_asset(manifest_asset, manifest_path)

    source_commit = extract_source_commit(release)
    if not source_commit:
        print(
            f"warning: release {args.repo}@{args.tag} does not expose source commit",
            file=sys.stderr,
        )
        return 0

    print(source_commit)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
