#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "generate-update-latest-manifest.py"


class GenerateUpdateLatestManifestTest(unittest.TestCase):
    def test_generates_manifest_with_sha256(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            assets = Path(tmp)
            exe = assets / "GoNavi-1.2.3-Windows-Amd64.exe"
            exe.write_bytes(b"fake-binary")
            (assets / "SHA256SUMS").write_text(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  GoNavi-1.2.3-Windows-Amd64.exe\n",
                encoding="utf-8",
            )
            out = assets / "latest.json"
            subprocess.check_call(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--assets-dir",
                    str(assets),
                    "--version",
                    "1.2.3",
                    "--tag",
                    "v1.2.3",
                    "--channel",
                    "latest",
                    "--output",
                    str(out),
                ],
                cwd=str(ROOT),
            )
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["schemaVersion"], 1)
            self.assertEqual(data["channel"], "latest")
            self.assertEqual(data["version"], "1.2.3")
            self.assertEqual(data["tagName"], "v1.2.3")
            self.assertEqual(len(data["assets"]), 1)
            asset = data["assets"][0]
            self.assertEqual(asset["name"], "GoNavi-1.2.3-Windows-Amd64.exe")
            self.assertEqual(
                asset["url"],
                "https://github.com/Syngnat/GoNavi/releases/download/v1.2.3/GoNavi-1.2.3-Windows-Amd64.exe",
            )
            self.assertEqual(asset["sha256"], "a" * 64)
            self.assertNotIn("SHA256SUMS", [a["name"] for a in data["assets"]])


if __name__ == "__main__":
    unittest.main()
