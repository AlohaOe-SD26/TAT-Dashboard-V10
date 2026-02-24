# tests/conftest.py — pytest fixtures for TAT-MIS-Architect
# pytest-flask is NOT required — we use the Flask test client directly.

from __future__ import annotations
import pytest
from src.app import create_app


@pytest.fixture(scope='session')
def app():
    """Create test app instance (shared across session for speed)."""
    app = create_app({
        'TESTING':        True,
        'SECRET_KEY':     'test-secret-key',
        'WTF_CSRF_ENABLED': False,
        'VERSION':        'v12.test',
    })
    return app


@pytest.fixture(scope='session')
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture(scope='session')
def runner(app):
    """Flask CLI test runner."""
    return app.test_cli_runner()
