"""Tiny smoke tests — run with: python -m pytest tests/test_smoke.py -q
or: python tests/test_smoke.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

# Project root on path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


class SmokeTests(unittest.TestCase):
    def test_import_package(self):
        import yt_stream_studio
        self.assertTrue(hasattr(yt_stream_studio, "__version__"))

    def test_config_migrate(self):
        from yt_stream_studio.session_meta import migrate_config, CFG_VERSION
        cfg = migrate_config({})
        self.assertEqual(cfg["cfg_version"], CFG_VERSION)
        self.assertIn("default_audio_track", cfg)

    def test_redact(self):
        from yt_stream_studio.logutil import redact
        s = redact("stream_key=abcd1234secret and Authorization: Bearer tok_xxx")
        self.assertNotIn("abcd1234secret", s)
        self.assertIn("REDACTED", s)

    def test_disk_check(self):
        from yt_stream_studio.features import check_disk_space
        ok, msg = check_disk_space([tempfile.gettempdir()], min_gb=0.001)
        self.assertTrue(ok)
        self.assertTrue(msg)

    def test_bitrate_presets(self):
        from yt_stream_studio.features import BITRATE_PRESETS
        self.assertGreaterEqual(len(BITRATE_PRESETS), 3)
        self.assertIn("kbps", BITRATE_PRESETS[0][1])

    def test_standby_cmd(self):
        from yt_stream_studio.standby import build_trickle_cmd
        cmd = build_trickle_cmd(prefer_qsv=False, use_desktop=False)
        self.assertIn("ffmpeg", cmd[0])
        self.assertIn("null", cmd)

    def test_json_roundtrip(self):
        from yt_stream_studio.util import load_json, save_json
        path = os.path.join(tempfile.mkdtemp(), "t.json")
        save_json(path, {"a": 1, "b": "x"})
        self.assertEqual(load_json(path)["a"], 1)


if __name__ == "__main__":
    unittest.main()
