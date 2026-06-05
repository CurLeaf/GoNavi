#!/usr/bin/env python3

import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("resolve-driver-release-source.py")
SPEC = importlib.util.spec_from_file_location("resolve_driver_release_source", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ResolveDriverReleaseSourceTests(unittest.TestCase):
    def test_extracts_commit_from_release_body_link(self):
        commit = "a" * 40
        release = {
            "body": (
                f"GoNavi dev driver-agent assets.\n\n"
                f"**提交**: [`{commit}`](https://github.com/Syngnat/GoNavi/commit/{commit})"
            )
        }
        self.assertEqual(MODULE.extract_source_commit(release), commit)

    def test_extracts_commit_from_plain_body_sha(self):
        commit = "b" * 40
        release = {"body": f"source commit: {commit}"}
        self.assertEqual(MODULE.extract_source_commit(release), commit)

    def test_falls_back_to_full_sha_target_commitish(self):
        commit = "c" * 40
        release = {"target_commitish": commit}
        self.assertEqual(MODULE.extract_source_commit(release), commit)

    def test_ignores_branch_name_target_commitish(self):
        release = {"body": "", "target_commitish": "main"}
        self.assertIsNone(MODULE.extract_source_commit(release))


if __name__ == "__main__":
    unittest.main()
