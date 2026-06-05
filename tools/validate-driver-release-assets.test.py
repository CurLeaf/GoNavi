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
                mismatches, skipped = MODULE.validate_release_assets(release, manifest)
            finally:
                MODULE.download_url = original_download
                MODULE.probe_metadata_revision = original_probe

        self.assertEqual(skipped, [])
        self.assertEqual(mismatches, [("clickhouse-driver-agent-darwin-arm64", "revision", "src-actual", "src-expected")])


if __name__ == "__main__":
    unittest.main()
