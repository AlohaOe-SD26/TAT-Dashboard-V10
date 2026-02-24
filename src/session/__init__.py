# src/session/__init__.py — v2.0
# Exposes the singleton `session` instance.
# All modules import `from src.session import session`.
# NEVER import SessionManager directly in route files.

from pathlib import Path
from flask import Flask
from src.session.manager import SessionManager

# Singleton — populated by init_session() called from app factory
session: SessionManager = None  # type: ignore[assignment]


def init_session(app: Flask) -> None:
    """
    Initialize the session singleton using app config. Called once from create_app().

    Backend selection (via app.config or environment):
        SESSION_BACKEND = 'sqlite' (default) | 'redis'
        SESSION_DB_PATH = 'config/session.db' (SQLite only)
        REDIS_URL       = 'redis://localhost:6379/0' (Redis only)
        REDIS_PREFIX    = 'tat_mis:' (Redis only, optional)
        REDIS_TTL       = None (Redis only, optional, seconds)

    To switch to Redis:
        1. pip install redis
        2. Add to config/settings.json: {"SESSION_BACKEND": "redis", "REDIS_URL": "redis://localhost:6379/0"}
        OR set environment variables SESSION_BACKEND=redis REDIS_URL=redis://...
    """
    global session
    from src.session.storage_backends import build_backend
    backend = build_backend(app.config)
    session = SessionManager(backend=backend)
