# src/session/storage_backends.py
# ─────────────────────────────────────────────────────────────────────────────
# Storage backend protocol + SQLite implementation.
# Follows the SessionManager two-tier storage architecture.
# Path.cwd() removed — all paths anchored to __file__ (Issue M-1).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import sqlite3
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


# ── Abstract Protocol ─────────────────────────────────────────────────────────

class StorageBackend(ABC):
    """Swappable storage protocol — SQLite by default, Redis-ready."""

    @abstractmethod
    def get(self, key: str) -> Optional[str]:
        ...

    @abstractmethod
    def set(self, key: str, value: str) -> None:
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        ...

    @abstractmethod
    def init(self) -> None:
        """Called once on construction to create tables / connections."""
        ...


# ── SQLite Implementation ─────────────────────────────────────────────────────

class SQLiteBackend(StorageBackend):
    """
    Thread-safe SQLite key-value store.
    db_path: absolute Path to the .db file.
    If a relative string is passed, it is resolved relative to the PROJECT ROOT
    (not Path.cwd()) to avoid launch-directory sensitivity.
    """

    def __init__(self, db_path: Path | str | None = None) -> None:
        if db_path is None:
            db_path = _PROJECT_ROOT / 'config' / 'session.db'
        elif isinstance(db_path, str):
            # M-1 fix: resolve relative strings against project root, not cwd
            p = Path(db_path)
            db_path = p if p.is_absolute() else _PROJECT_ROOT / p
        else:
            db_path = Path(db_path)

        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
        self._lock    = threading.Lock()
        self._local   = threading.local()
        self.init()

    # ── Connection management ─────────────────────────────────────────────

    def _conn(self) -> sqlite3.Connection:
        """Return a thread-local connection, creating it if needed."""
        if not getattr(self._local, 'conn', None):
            conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._local.conn = conn
        return self._local.conn

    def init(self) -> None:
        with self._lock:
            conn = self._conn()
            conn.execute("""
                CREATE TABLE IF NOT EXISTS kv_store (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            conn.commit()

    # ── Core operations ───────────────────────────────────────────────────

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            try:
                row = self._conn().execute(
                    "SELECT value FROM kv_store WHERE key = ?", (key,)
                ).fetchone()
                return row[0] if row else None
            except sqlite3.Error:
                return None

    def set(self, key: str, value: str) -> None:
        with self._lock:
            try:
                conn = self._conn()
                conn.execute(
                    "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
                    (key, value)
                )
                conn.commit()
            except sqlite3.Error as e:
                print(f"[SESSION-DB] Write error for '{key}': {e}")

    def delete(self, key: str) -> None:
        with self._lock:
            try:
                conn = self._conn()
                conn.execute("DELETE FROM kv_store WHERE key = ?", (key,))
                conn.commit()
            except sqlite3.Error as e:
                print(f"[SESSION-DB] Delete error for '{key}': {e}")

    def keys(self, prefix: str = '') -> list[str]:
        """Return all keys matching optional prefix."""
        with self._lock:
            try:
                if prefix:
                    rows = self._conn().execute(
                        "SELECT key FROM kv_store WHERE key LIKE ?",
                        (f"{prefix}%",)
                    ).fetchall()
                else:
                    rows = self._conn().execute(
                        "SELECT key FROM kv_store"
                    ).fetchall()
                return [r[0] for r in rows]
            except sqlite3.Error:
                return []

    def clear(self) -> None:
        """Wipe all keys — for testing only."""
        with self._lock:
            try:
                conn = self._conn()
                conn.execute("DELETE FROM kv_store")
                conn.commit()
            except sqlite3.Error as e:
                print(f"[SESSION-DB] Clear error: {e}")
