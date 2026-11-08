"""Last-run session metadata + config migration helpers."""
from __future__ import annotations

import os
import time
from datetime import datetime

from .config import logs_root, CONFIG_PATH
from .util import load_json, save_json

CFG_VERSION = 2
LAST_SESSION_PATH = os.path.join(logs_root(), "last_session.json")


def migrate_config(cfg: dict) -> dict:
    """Return cfg upgraded to CFG_VERSION (idempotent)."""
    if not isinstance(cfg, dict):
        cfg = {}
    ver = int(cfg.get("cfg_version") or 1)
    if ver < 2:
        # v2: explicit defaults that older builds omitted
        cfg.setdefault("default_audio_track", "first")
        cfg.setdefault("show_resource_use", False)
        cfg.setdefault("standby_auto", False)
        cfg["cfg_version"] = 2
        ver = 2
    cfg["cfg_version"] = CFG_VERSION
    return cfg


def load_config():
    raw = load_json(CONFIG_PATH)
    cfg = migrate_config(dict(raw) if isinstance(raw, dict) else {})
    if cfg.get("cfg_version") != (raw or {}).get("cfg_version"):
        try:
            save_json(CONFIG_PATH, cfg)
        except Exception:
            pass
    return cfg


def write_last_session(**fields):
    data = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "unix": time.time(),
        "clean_exit": False,
    }
    data.update(fields)
    try:
        os.makedirs(logs_root(), exist_ok=True)
    except OSError:
        pass
    save_json(LAST_SESSION_PATH, data)


def mark_clean_exit():
    d = load_json(LAST_SESSION_PATH)
    if d:
        d["clean_exit"] = True
        d["ended"] = datetime.now().isoformat(timespec="seconds")
        save_json(LAST_SESSION_PATH, d)


def last_session_unclean():
    d = load_json(LAST_SESSION_PATH)
    if d and not d.get("clean_exit", True):
        return d
    return None
