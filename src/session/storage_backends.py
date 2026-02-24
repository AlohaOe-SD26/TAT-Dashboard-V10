# src/session/storage_backends.py — v1.0
# ─────────────────────────────────────────────────────────────────────────────
# Pluggable storage backends for SessionManager persistent tier.
#
# Swap procedure:
#   1. Set SESSION_BACKEND = 'redis' in config/settings.json
#   2. Set REDIS_URL = 'redis://localhost:6379/0' (or env var)
#   3. pip install redis
#   Done. No route or SessionManager caller changes needed.
#
# Backend contract:
#   get(key)         → str | None
#   set(key, value)  → None          (value is always a JSON string)
#   delete(key)      → None
#   init()           → None          (called once at startup)
#   clear_all()      → None          (wipe everything — used in session.clear())
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import sqlite3
import threading
from abc import ABC, abstractmethod
from pathlib import Path


# ── Abstract Protocol ─────────────────────────────────────────────────────────

class StorageBackend(ABC):
    """Abstract base class for session persistent storage."""

    @abstractmethod
    def get(self, key: str) -> str | None:
        """Return the raw JSON string stored at `key`, or None if missing."""
        ...

    @abstractmethod
    def set(self, key: str, value: str) -> None:
        """Store a raw JSON string at `key`. Overwrites existing value."""
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove `key` from the store. No-op if key does not exist."""
        ...

    @abstractmethod
    def init(self) -> None:
        """One-time setup (create table, test connection, etc.). Called at startup."""
        ...

    @abstractmethod
    def clear_all(self) -> None:
        """Wipe all persisted session data. Used by SessionManager.clear()."""
        ...


# ── SQLite Backend (default) ──────────────────────────────────────────────────

class SQLiteBackend(StorageBackend):
    """
    SQLite KV store. Zero external dependencies — always available.
    Thread-safe via threading.Lock.

    Schema:
        session (key TEXT PRIMARY KEY, value TEXT NOT NULL)
    """

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()

    def init(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS session (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            conn.commit()
            conn.close()
        print(f"[SESSION] SQLite backend: {self._db_path}")

    def get(self, key: str) -> str | None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            row = conn.execute(
                "SELECT value FROM session WHERE key = ?", (key,)
            ).fetchone()
            conn.close()
            return row[0] if row else None

    def set(self, key: str, value: str) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.execute(
                "INSERT OR REPLACE INTO session (key, value) VALUES (?, ?)",
                (key, value)
            )
            conn.commit()
            conn.close()

    def delete(self, key: str) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.execute("DELETE FROM session WHERE key = ?", (key,))
            conn.commit()
            conn.close()

    def clear_all(self) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.execute("DELETE FROM session")
            conn.commit()
            conn.close()


# ── Redis Backend (optional) ──────────────────────────────────────────────────

class RedisBackend(StorageBackend):
    """
    Redis KV store. Requires `pip install redis` and a running Redis instance.

    Config keys (from Flask app.config or environment):
        REDIS_URL    — e.g. 'redis://localhost:6379/0' (default)
        REDIS_PREFIX — key namespace prefix, default 'tat_mis:'
        REDIS_TTL    — TTL in seconds for all keys, default None (no expiry)

    All keys are namespaced: f"{prefix}{key}" → prevents collisions with
    other apps sharing the same Redis instance.

    Thread safety: redis-py is thread-safe by default (connection pool).
    """

    def __init__(self, url: str, prefix: str = 'tat_mis:', ttl: int | None = None) -> None:
        self._url    = url
        self._prefix = prefix
        self._ttl    = ttl
        self._r      = None  # Populated in init()

    def _k(self, key: str) -> str:
        """Apply namespace prefix to a key."""
        return f"{self._prefix}{key}"

    def init(self) -> None:
        try:
            import redis  # type: ignore
            self._r = redis.from_url(self._url, decode_responses=True)
            self._r.ping()
            print(f"[SESSION] Redis backend: {self._url} (prefix={self._prefix!r})")
        except ImportError as exc:
            raise RuntimeError(
                "Redis backend requires 'redis' package. "
                "Run: pip install redis"
            ) from exc
        except Exception as exc:
            raise RuntimeError(
                f"Redis connection failed ({self._url}): {exc}"
            ) from exc

    def get(self, key: str) -> str | None:
        return self._r.get(self._k(key))

    def set(self, key: str, value: str) -> None:
        if self._ttl:
            self._r.setex(self._k(key), self._ttl, value)
        else:
            self._r.set(self._k(key), value)

    def delete(self, key: str) -> None:
        self._r.delete(self._k(key))

    def clear_all(self) -> None:
        """Delete all keys matching the namespace prefix (SCAN + DEL, safe for prod)."""
        cursor = 0
        pattern = f"{self._prefix}*"
        while True:
            cursor, keys = self._r.scan(cursor, match=pattern, count=100)
            if keys:
                self._r.delete(*keys)
            if cursor == 0:
                break


# ── Factory ───────────────────────────────────────────────────────────────────

def build_backend(app_config: dict) -> StorageBackend:
    """
    Select and construct the appropriate storage backend from Flask app.config.

    Decision logic:
        1. SESSION_BACKEND = 'redis' → RedisBackend
        2. REDIS_URL set             → RedisBackend  (implicit opt-in)
        3. Otherwise                 → SQLiteBackend (safe default)

    Config keys consumed:
        SESSION_BACKEND  — 'sqlite' | 'redis'
        SESSION_DB_PATH  — SQLite only: path string, default 'config/session.db'
        REDIS_URL        — Redis only: connection URL
        REDIS_PREFIX     — Redis only: key namespace, default 'tat_mis:'
        REDIS_TTL        — Redis only: TTL seconds (int), default None
    """
    import os

    backend_type = (
        app_config.get('SESSION_BACKEND') or
        os.environ.get('SESSION_BACKEND', 'sqlite')
    ).lower()

    redis_url = (
        app_config.get('REDIS_URL') or
        os.environ.get('REDIS_URL', '')
    )

    # Implicit Redis opt-in if REDIS_URL is set but SESSION_BACKEND isn't explicit
    if redis_url and backend_type == 'sqlite':
        backend_type = 'redis'

    if backend_type == 'redis':
        if not redis_url:
            redis_url = 'redis://localhost:6379/0'
        prefix = app_config.get('REDIS_PREFIX', 'tat_mis:')
        ttl    = app_config.get('REDIS_TTL', None)
        return RedisBackend(url=redis_url, prefix=prefix, ttl=ttl)

    # Default: SQLite
    db_path_str = app_config.get('SESSION_DB_PATH', 'config/session.db')
    db_path = Path.cwd() / db_path_str
    return SQLiteBackend(db_path=db_path)
