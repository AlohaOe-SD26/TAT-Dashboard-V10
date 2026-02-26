# src/utils/logger.py
# ─────────────────────────────────────────────────────────────────────────────
# Centralized logging setup for BLAZE MIS Audit Pro.
# Path.cwd() removed — log path anchored to __file__ (Issue M-2).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

# M-2 fix: anchored to project root via __file__, not Path.cwd()
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_LOG_DIR = _PROJECT_ROOT / 'logs'


def setup_logger(
    name:      str = 'blaze_mis',
    log_dir:   str = 'logs',
    log_file:  str = 'app.log',
    level:     int = logging.INFO,
    max_bytes: int = 5 * 1024 * 1024,
    backup_count: int = 3,
) -> logging.Logger:
    """
    Set up and return a named logger with both file and console handlers.
    log_dir is resolved relative to the project root (not cwd).
    """
    # M-2 fix: project-root-relative, not cwd-relative
    log_path = _PROJECT_ROOT / log_dir
    log_path.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)
    if logger.handlers:
        # Already configured in this process — return as-is
        return logger

    logger.setLevel(level)
    formatter = logging.Formatter(
        fmt='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )

    # Rotating file handler
    fh = RotatingFileHandler(
        log_path / log_file,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding='utf-8',
    )
    fh.setFormatter(formatter)
    fh.setLevel(level)
    logger.addHandler(fh)

    # Console handler (print-level — always INFO or higher)
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(formatter)
    ch.setLevel(logging.INFO)
    logger.addHandler(ch)

    return logger


def get_logger(name: str = 'blaze_mis') -> logging.Logger:
    """Return an existing logger or create one with defaults."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        return setup_logger(name)
    return logger


def console_log(message: str, level: str = 'INFO', logger_name: str = 'blaze_mis') -> None:
    """
    Emit a timestamped console message via both print() (for real-time headless
    visibility) and the named logger (for file persistence).
    level: 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'DEBUG'
    v10: public utility function required by src/utils/__init__.py.
    """
    from datetime import datetime
    tag     = f"[{datetime.now().strftime('%H:%M:%S')}] [{level.upper()}]"
    message = str(message)
    print(f"{tag} {message}")
    lg = get_logger(logger_name)
    level_upper = level.upper()
    if level_upper in ('WARN', 'WARNING'):
        lg.warning(message)
    elif level_upper == 'ERROR':
        lg.error(message)
    elif level_upper == 'DEBUG':
        lg.debug(message)
    else:
        lg.info(message)
