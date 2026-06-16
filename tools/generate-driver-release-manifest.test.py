#!/usr/bin/env python3

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "tools" / "generate-driver-release-manifest.py"


def expected_revision(revision_file: Path, driver: str):
    for line in revision_file.read_text(encoding="utf-8").splitlines():
        if f'"{driver}"' not in line:
            continue
        left, right = line.strip().rstrip(",").split(":", 1)
        if left.strip().strip('"') == driver:
            return right.strip().strip('"')
    raise AssertionError(f"missing revision for {driver}")


class GenerateDriverReleaseManifestTest(unittest.TestCase):
    def _generate_revision_file(self, platform: str, drivers: str = "clickhouse"):
        worktree = Path(tempfile.mkdtemp(prefix="gonavi-release-manifest-worktree-"))
        subprocess.run(
            ["git", "worktree", "add", "--detach", str(worktree), "HEAD"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        self.addCleanup(
            lambda: subprocess.run(
                ["git", "worktree", "remove", "--force", str(worktree)],
                cwd=ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        )
        subprocess.run(
            ["bash", "./tools/generate-driver-agent-revisions.sh", "--platform", platform, "--drivers", drivers],
            cwd=worktree,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return worktree / "internal" / "db" / "driver_agent_revisions_gen.go"

    def test_generates_manifest_without_executing_cross_platform_assets(self):
        with tempfile.TemporaryDirectory(prefix="gonavi-release-manifest-test-") as tmp:
            tmpdir = Path(tmp)
            assets_dir = tmpdir / "drivers"
            (assets_dir / "MacOS").mkdir(parents=True)
            (assets_dir / "Linux").mkdir(parents=True)
            (assets_dir / "Windows").mkdir(parents=True)

            fixtures = {
                assets_dir / "MacOS" / "clickhouse-driver-agent-darwin-arm64": b"darwin-binary",
                assets_dir / "Linux" / "clickhouse-driver-agent-linux-amd64": b"linux-binary",
                assets_dir / "Windows" / "clickhouse-driver-agent-windows-amd64.exe": b"MZfake-binary",
                assets_dir / "Windows" / "mongodb-driver-agent-v1-windows-amd64.exe": b"MZfake-mongodb-v1",
                assets_dir / "Windows" / "mongodb-driver-agent-v2-windows-amd64.exe": b"MZfake-mongodb-v2",
            }
            for path, content in fixtures.items():
                path.write_bytes(content)
                os.chmod(path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

            output = tmpdir / "manifest.json"
            proc = subprocess.run(
                ["python3", str(SCRIPT), "--assets-dir", str(assets_dir), "--output", str(output)],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )

            self.assertIn("asset count: 5", proc.stdout)
            manifest = json.loads(output.read_text(encoding="utf-8"))
            assets = manifest["assets"]
            darwin_revision_file = self._generate_revision_file("darwin/arm64")
            linux_revision_file = self._generate_revision_file("linux/amd64")
            windows_revision_file = self._generate_revision_file("windows/amd64", "clickhouse,mongodb")
            self.assertEqual(
                assets["clickhouse-driver-agent-darwin-arm64"]["revision"],
                expected_revision(darwin_revision_file, "clickhouse"),
            )
            self.assertEqual(
                assets["clickhouse-driver-agent-linux-amd64"]["revision"],
                expected_revision(linux_revision_file, "clickhouse"),
            )
            self.assertEqual(
                assets["clickhouse-driver-agent-windows-amd64.exe"]["revision"],
                expected_revision(windows_revision_file, "clickhouse"),
            )
            self.assertEqual(
                assets["mongodb-driver-agent-v1-windows-amd64.exe"]["driver"],
                "mongodb",
            )
            self.assertEqual(
                assets["mongodb-driver-agent-v1-windows-amd64.exe"]["platform"],
                "windows/amd64",
            )
            self.assertEqual(
                assets["mongodb-driver-agent-v1-windows-amd64.exe"]["revision"],
                expected_revision(windows_revision_file, "mongodb"),
            )
            self.assertEqual(
                assets["mongodb-driver-agent-v2-windows-amd64.exe"]["driver"],
                "mongodb",
            )


if __name__ == "__main__":
    unittest.main()
