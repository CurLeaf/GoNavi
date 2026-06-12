#!/usr/bin/env python3

import hashlib
import importlib.util
import pathlib
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("validate-driver-release-assets.py")
SPEC = importlib.util.spec_from_file_location("validate_driver_release_assets", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ValidateDriverReleaseAssetsTests(unittest.TestCase):
    def test_infer_asset_path(self):
        self.assertEqual(
            MODULE.infer_asset_path("clickhouse-driver-agent-darwin-arm64"),
            "MacOS/clickhouse-driver-agent-darwin-arm64",
        )
        self.assertEqual(
            MODULE.infer_asset_path("clickhouse-driver-agent-windows-arm64.exe"),
            "Windows/clickhouse-driver-agent-windows-arm64.exe",
        )
        self.assertEqual(
            MODULE.infer_asset_path("mongodb-driver-agent-v1-windows-amd64.exe"),
            "Windows/mongodb-driver-agent-v1-windows-amd64.exe",
        )
        self.assertEqual(
            MODULE.infer_asset_path("mongodb-driver-agent-v2-darwin-arm64"),
            "MacOS/mongodb-driver-agent-v2-darwin-arm64",
        )
        self.assertEqual(MODULE.infer_asset_path("duckdb.dll"), "Windows/duckdb.dll")
        self.assertIsNone(MODULE.infer_asset_path("duckdb-driver.zip"))

    def test_validate_release_assets_reports_sha_mismatch(self):
        release = {
            "assets": [
                {
                    "name": "clickhouse-driver-agent-darwin-arm64",
                    "browser_download_url": "https://example.test/clickhouse-driver-agent-darwin-arm64",
                }
            ]
        }
        manifest = {
            "assets": {
                "clickhouse-driver-agent-darwin-arm64": {
                    "revision": "src-expected",
                    "sha256": "deadbeef",
                }
            }
        }

        with tempfile.TemporaryDirectory(prefix="gonavi-validate-release-assets-") as tmp:
            payload_path = pathlib.Path(tmp) / "clickhouse-driver-agent-darwin-arm64"
            payload_path.write_bytes(b"test-binary")

            def fake_download(url, destination):
                destination.write_bytes(payload_path.read_bytes())

            original_download = MODULE.download_url
            original_probe = MODULE.probe_metadata_revision
            try:
                MODULE.download_url = fake_download
                MODULE.probe_metadata_revision = lambda _path: "src-expected"
                mismatches, skipped = MODULE.validate_release_assets(release, manifest)
            finally:
                MODULE.download_url = original_download
                MODULE.probe_metadata_revision = original_probe

        self.assertEqual(skipped, [])
        self.assertEqual(len(mismatches), 1)
        name, field, actual, expected = mismatches[0]
        self.assertEqual(name, "clickhouse-driver-agent-darwin-arm64")
        self.assertEqual(field, "sha256")
        self.assertEqual(actual, hashlib.sha256(b"test-binary").hexdigest())
        self.assertEqual(expected, "deadbeef")

    def test_validate_release_assets_reports_revision_mismatch(self):
        release = {
            "assets": [
                {
                    "name": "clickhouse-driver-agent-darwin-arm64",
                    "browser_download_url": "https://example.test/clickhouse-driver-agent-darwin-arm64",
                }
            ]
        }
        payload = b"test-binary"
        manifest = {
            "assets": {
                "clickhouse-driver-agent-darwin-arm64": {
                    "platform": "darwin/arm64",
                    "revision": "src-expected",
                    "sha256": hashlib.sha256(payload).hexdigest(),
                }
            }
        }

        with tempfile.TemporaryDirectory(prefix="gonavi-validate-release-assets-") as tmp:
            payload_path = pathlib.Path(tmp) / "clickhouse-driver-agent-darwin-arm64"
            payload_path.write_bytes(payload)

            def fake_download(url, destination):
                destination.write_bytes(payload_path.read_bytes())

            original_download = MODULE.download_url
            original_probe = MODULE.probe_metadata_revision
            try:
                MODULE.download_url = fake_download
                MODULE.probe_metadata_revision = lambda _path: "src-actual"
                mismatches, skipped = MODULE.validate_release_assets(release, manifest, runtime_platform="darwin/arm64")
            finally:
                MODULE.download_url = original_download
                MODULE.probe_metadata_revision = original_probe

        self.assertEqual(skipped, [])
        self.assertEqual(mismatches, [("clickhouse-driver-agent-darwin-arm64", "revision", "src-actual", "src-expected")])

    def test_validate_release_assets_skips_cross_platform_revision_probe(self):
        release = {
            "assets": [
                {
                    "name": "clickhouse-driver-agent-darwin-amd64",
                    "browser_download_url": "https://example.test/clickhouse-driver-agent-darwin-amd64",
                }
            ]
        }
        payload = b"darwin-binary"
        manifest = {
            "assets": {
                "clickhouse-driver-agent-darwin-amd64": {
                    "platform": "darwin/amd64",
                    "revision": "src-expected",
                    "sha256": hashlib.sha256(payload).hexdigest(),
                }
            }
        }

        with tempfile.TemporaryDirectory(prefix="gonavi-validate-release-assets-") as tmp:
            payload_path = pathlib.Path(tmp) / "clickhouse-driver-agent-darwin-amd64"
            payload_path.write_bytes(payload)

            def fake_download(url, destination):
                destination.write_bytes(payload_path.read_bytes())

            def fail_probe(_path):
                raise AssertionError("cross-platform asset should not be executed")

            original_download = MODULE.download_url
            original_probe = MODULE.probe_metadata_revision
            try:
                MODULE.download_url = fake_download
                MODULE.probe_metadata_revision = fail_probe
                mismatches, skipped = MODULE.validate_release_assets(release, manifest, runtime_platform="linux/amd64")
            finally:
                MODULE.download_url = original_download
                MODULE.probe_metadata_revision = original_probe

        self.assertEqual(mismatches, [])
        self.assertEqual(skipped, [])

    def test_validate_release_assets_uses_release_digest_without_download(self):
        payload = b"darwin-binary"
        digest = hashlib.sha256(payload).hexdigest()
        release = {
            "assets": [
                {
                    "name": "clickhouse-driver-agent-darwin-amd64",
                    "digest": f"sha256:{digest}",
                    "browser_download_url": "https://example.test/clickhouse-driver-agent-darwin-amd64",
                }
            ]
        }
        manifest = {
            "assets": {
                "clickhouse-driver-agent-darwin-amd64": {
                    "platform": "darwin/amd64",
                    "revision": "src-expected",
                    "sha256": digest,
                }
            }
        }

        def fail_download(_url, _destination):
            raise AssertionError("release digest should avoid downloading cross-platform assets")

        original_download = MODULE.download_url
        try:
            MODULE.download_url = fail_download
            mismatches, skipped = MODULE.validate_release_assets(release, manifest, runtime_platform="linux/amd64")
        finally:
            MODULE.download_url = original_download

        self.assertEqual(mismatches, [])
        self.assertEqual(skipped, [])


if __name__ == "__main__":
    unittest.main()
