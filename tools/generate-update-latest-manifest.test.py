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
            exe = assets / "GoNavi-1.2.3-Windows-Amd64-Portable.exe"
            msi = assets / "GoNavi-1.2.3-Windows-Amd64-Installer.msi"
            exe.write_bytes(b"fake-binary")
            msi.write_bytes(b"fake-installer")
            (assets / "LICENSE").write_text("license text\n", encoding="utf-8")
            (assets / "NOTICE").write_text("notice text\n", encoding="utf-8")
            (assets / "SHA256SUMS").write_text(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  GoNavi-1.2.3-Windows-Amd64-Portable.exe\n"
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  GoNavi-1.2.3-Windows-Amd64-Installer.msi\n",
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
            assets_by_name = {asset["name"]: asset for asset in data["assets"]}
            self.assertEqual(
                set(assets_by_name),
                {
                    "GoNavi-1.2.3-Windows-Amd64-Portable.exe",
                    "GoNavi-1.2.3-Windows-Amd64-Installer.msi",
                },
            )
            portable_asset = assets_by_name["GoNavi-1.2.3-Windows-Amd64-Portable.exe"]
            self.assertEqual(
                portable_asset["url"],
                "https://github.com/Syngnat/GoNavi/releases/download/v1.2.3/GoNavi-1.2.3-Windows-Amd64-Portable.exe",
            )
            self.assertEqual(portable_asset["sha256"], "a" * 64)
            installer_asset = assets_by_name["GoNavi-1.2.3-Windows-Amd64-Installer.msi"]
            self.assertEqual(
                installer_asset["url"],
                "https://github.com/Syngnat/GoNavi/releases/download/v1.2.3/GoNavi-1.2.3-Windows-Amd64-Installer.msi",
            )
            self.assertEqual(installer_asset["sha256"], "b" * 64)
            self.assertNotIn("SHA256SUMS", [a["name"] for a in data["assets"]])
            self.assertNotIn("LICENSE", [a["name"] for a in data["assets"]])
            self.assertNotIn("NOTICE", [a["name"] for a in data["assets"]])


if __name__ == "__main__":
    unittest.main()
