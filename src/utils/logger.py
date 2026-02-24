# src/utils/logger.py - v1.0
# pip install flask
# Hybrid logger: standard logging to file (silent errors/state),
# print() to stdout (runtime console feedback for headless ops).
# Call get_logger(__name__) in any module.

from pathlib import Path
import logging
import sys


def get_logger(name: str, log_dir: str = 'logs') -> logging.Logger:
    """
    Return a configured logger that writes to both a rotating log file
    and stdout. The file handler captures WARNING+ silently.
    The stream handler captures INFO+ for console visibility.

    Args:
        name:    Module name (pass __name__).
        log_dir: Directory for log files. Created if missing.

    Returns:
        Configured logging.Logger instance.
    """
    log_path = Path.cwd() / log_dir
    log_path.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)

    if logger.handlers:
        # Already configured — avoid duplicate handlers on re-import
        return logger

    logger.setLevel(logging.DEBUG)

    # ── File handler — WARNING and above ────────────────────────────────────
    file_handler = logging.FileHandler(
        log_path / 'app.log', encoding='utf-8'
    )
    file_handler.setLevel(logging.WARNING)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    ))

    # ── Stream handler — INFO and above (console) ────────────────────────────
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(logging.Formatter(
        '[%(name)s] %(message)s'
    ))

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    return logger


def console_log(label: str, message: str) -> None:
    """
    Convenience print() wrapper for timestamped runtime console output.
    Use for headless ops where you want immediate visual feedback.
    This intentionally uses print() not logging, per the hybrid logging standard.

    Example:
        console_log('MATCHER', 'Processing weekly section — 42 rows')
        # Outputs: [MATCHER] Processing weekly section — 42 rows
    """
    print(f"[{label.upper()}] {message}")
