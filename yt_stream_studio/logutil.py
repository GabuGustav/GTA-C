"""Rotating file logging + secret redaction. Light weight — no third-party deps."""
from __future__ import annotations

import logging
import os
import re
import sys
from logging.handlers import RotatingFileHandler

from .config import logs_root

_SECRET_RE = re.compile(
    r"(?i)(stream[_-]?key|access_token|refresh_token|client_secret|authorization|bearer)\s*[=:]\s*\S+"
)
_KEYISH_RE = re.compile(r"(?i)(rtmp://[^\s]+/[^\s]{8,})")
_logger = None


def redact(text: str) -> str:
    if not text:
        return text
    text = _SECRET_RE.sub(r"\1=[REDACTED]", text)
    text = _KEYISH_RE.sub("rtmp://[REDACTED]", text)
    return text


class _RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            if isinstance(record.msg, str):
                record.msg = redact(record.msg)
            if record.args:
                if isinstance(record.args, dict):
                    record.args = {k: redact(str(v)) for k, v in record.args.items()}
                else:
                    record.args = tuple(
                        redact(str(a)) if isinstance(a, str) else a for a in record.args
                    )
        except Exception:
            pass
        return True


def get_logger(name: str = "yt_stream_studio") -> logging.Logger:
    global _logger
    if _logger is not None:
        return _logger
    log = logging.getLogger(name)
    log.setLevel(logging.INFO)
    log.propagate = False
    if not log.handlers:
        try:
            os.makedirs(logs_root(), exist_ok=True)
        except OSError:
            pass
        path = os.path.join(logs_root(), "app.log")
        try:
            fh = RotatingFileHandler(
                path, maxBytes=2_000_000, backupCount=5, encoding="utf-8"
            )
            fh.setFormatter(logging.Formatter(
                "%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S"))
            fh.addFilter(_RedactFilter())
            log.addHandler(fh)
        except Exception:
            sh = logging.StreamHandler(sys.stderr)
            sh.addFilter(_RedactFilter())
            log.addHandler(sh)
    _logger = log
    return log


def file_log(level: str, msg: str) -> None:
    """Best-effort write to the rotating log (never raises)."""
    try:
        getattr(get_logger(), level.lower(), get_logger().info)(redact(str(msg)))
    except Exception:
        pass
