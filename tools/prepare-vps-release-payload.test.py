#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("prepare-vps-release-payload.py")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class PrepareVPSReleasePayloadTest(unittest.TestCase):
    def run_script(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_builds_stable_app_and_driver_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            app_dir = root / "app"
            driver_dir = root / "driver"
            app_dir.mkdir()
            driver_dir.mkdir()

            app_bytes = b"portable zip"
            (app_dir / "GoNavi.zip").write_bytes(app_bytes)
            app_manifest = app_dir / "latest.json"
            app_manifest.write_text(
                json.dumps(
                    {
                        "tagName": "v1.2.3",
                        "assets": [
                            {
                                "name": "GoNavi.zip",
                                "size": len(app_bytes),
                                "sha256": sha256(app_bytes),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            driver_bytes = b"driver"
            (driver_dir / "mysql.exe").write_bytes(driver_bytes)
            assets = {"mysql.exe": len(driver_bytes)}
            version_index = driver_dir / "version-index.json"
            latest_index = driver_dir / "latest-index.json"
            version_index.write_text(
                json.dumps({"tagName": "v1.2.3", "assets": assets}),
                encoding="utf-8",
            )
            latest_index.write_text(
                json.dumps({"tagName": "v1.2.3", "assets": assets}),
                encoding="utf-8",
            )

            output = root / "output"
            result = self.run_script(
                "--channel",
                "stable",
                "--app-tag",
                "v1.2.3",
                "--app-dir",
                str(app_dir),
                "--app-manifest",
                str(app_manifest),
                "--driver-tag",
                "v1.2.3",
                "--driver-dir",
                str(driver_dir),
                "--driver-version-index",
                str(version_index),
                "--driver-latest-index",
                str(latest_index),
                "--output",
                str(output),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(
                (output / "payload/gonavi/releases/download/v1.2.3/GoNavi.zip").is_file()
            )
            self.assertTrue(
                (output / "payload/gonavi/releases/latest/latest.json").is_file()
            )
            self.assertTrue(
                (
                    output
                    / "payload/drivers/releases/download/v1.2.3/mysql.exe"
                ).is_file()
            )
            self.assertTrue(
                (
                    output
                    / "payload/drivers/releases/latest/GoNavi-DriverAgents-Index.json"
                ).is_file()
            )
            metadata = json.loads((output / "deployment.json").read_text())
            self.assertTrue(metadata["driverEnabled"])
            self.assertGreater(metadata["payloadBytes"], 0)
            self.assertEqual(
                len((output / "SHA256SUMS").read_text().splitlines()),
                metadata["fileCount"],
            )

    def test_rejects_manifest_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            app_dir = root / "app"
            app_dir.mkdir()
            app_manifest = app_dir / "latest-dev.json"
            app_manifest.write_text(
                json.dumps(
                    {
                        "channel": "dev",
                        "version": "dev-abc123",
                        "assets": [
                            {
                                "name": "../GoNavi.zip",
                                "size": 0,
                                "sha256": sha256(b""),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            result = self.run_script(
                "--channel",
                "dev",
                "--app-tag",
                "dev-abc123",
                "--app-dir",
                str(app_dir),
                "--app-manifest",
                str(app_manifest),
                "--output",
                str(root / "output"),
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("invalid app asset name", result.stderr)


if __name__ == "__main__":
    unittest.main()
