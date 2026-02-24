# src/session/manager.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# ARCHITECTURE: Two-tier storage
#
#   VOLATILE (_volatile dict, in-process memory):
#     Non-serializable / high-churn objects that must NOT go to SQLite.
#     browser_instance, sheets_service, mis_bracket_map, mis_prefix_map,
#     mis_rebate_type_columns, blaze_df_raw, blaze_inventory_data,
#     blaze_inventory_cache, mis_df, google_df
#
#   PERSISTENT (SQLite, Redis-swappable):
#     All scalar / simple JSON-serializable state.
#     blaze_token, spreadsheet_id, mis_current_sheet, mis_header_row_idx,
#     browser_ready, automation_in_progress, blaze_last_update_ts,
#     blaze_inventory_running, blaze_inventory_start_time, blaze_inventory_logs,
#     blaze_credentials, brand_settings, sections_data, etc.
#
# Redis swap: replace _db_get / _db_set / _db_delete only — callers unchanged.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

import pandas as pd

from src.session.storage_backends import StorageBackend, SQLiteBackend


class SessionManager:
    """
    Thread-safe, single-user session state. Replaces GLOBAL_DATA dict.

    Usage:
        from src.session import session

        # Volatile (runtime objects)
        session.set_browser(driver)
        driver = session.get_browser()

        # Persistent (serializable state)
        session.set('blaze_token', token)
        token = session.get('blaze_token')

        # Typed DataFrame accessors
        session.set_mis_df(df)
        df = session.get_mis_df()
    """

    # Keys that live only in volatile memory (never hit SQLite)
    _VOLATILE_KEYS: frozenset[str] = frozenset({
        'browser_instance',
        'sheets_service',
        'mis_bracket_map',
        'mis_prefix_map',
        'mis_rebate_type_columns',
        'blaze_df_raw',
        'blaze_inventory_data',
        'blaze_inventory_cache',
        'mis_df',
        'google_df',
    })

    def __init__(self, backend: StorageBackend | None = None, db_path: Path | None = None) -> None:
        # Accept either an injected backend (new) or a db_path (legacy compatibility)
        if backend is not None:
            self._backend = backend
        elif db_path is not None:
            self._backend = SQLiteBackend(db_path=db_path)
        else:
            # Absolute fallback: in-memory SQLite (tests / no-config startup)
            self._backend = SQLiteBackend(db_path=Path.cwd() / 'config' / 'session.db')

        self._lock = threading.Lock()
        self._volatile: dict[str, Any] = {
            'browser_instance':       None,
            'sheets_service':         None,
            'mis_bracket_map':        {},
            'mis_prefix_map':         {},
            'mis_rebate_type_columns': [],
            'blaze_df_raw':           None,
            'blaze_inventory_data':   None,
            'blaze_inventory_cache':  {},
            'mis_df':                 None,
            'google_df':              None,
        }
        self._backend.init()

    # ── Core KV Interface ────────────────────────────────────────────────────

    def get(self, key: str, default: Any = None) -> Any:
        """Retrieve a value — volatile store first, then SQLite."""
        if key in self._VOLATILE_KEYS:
            return self._volatile.get(key, default)
        raw = self._db_get(key)
        if raw is None:
            return default
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    def set(self, key: str, value: Any) -> None:
        """Store a value — volatile store or SQLite based on key."""
        if key in self._VOLATILE_KEYS:
            with self._lock:
                self._volatile[key] = value
        else:
            self._db_set(key, json.dumps(value, default=str))

    def delete(self, key: str) -> None:
        if key in self._VOLATILE_KEYS:
            with self._lock:
                self._volatile[key] = None
        else:
            self._db_delete(key)

    def clear(self) -> None:
        """Wipe all state (volatile + persistent). Use with caution."""
        with self._lock:
            self._volatile = {k: ([] if k.endswith('_columns') else ({} if k.endswith(('_map', '_cache')) else None))
                              for k in self._VOLATILE_KEYS}
        self._backend.clear_all()

    # ── Browser ──────────────────────────────────────────────────────────────

    def get_browser(self) -> Any | None:
        """Return the active Selenium WebDriver instance, or None."""
        return self._volatile.get('browser_instance')

    def set_browser(self, driver: Any) -> None:
        with self._lock:
            self._volatile['browser_instance'] = driver
            self._volatile_set_ready(driver is not None)

    def _volatile_set_ready(self, ready: bool) -> None:
        """Internal — called only from set_browser to keep ready flag consistent."""
        # browser_ready is SQLite (survives Flask reloads)
        self._db_set('browser_ready', json.dumps(ready))

    def get_browser_ready(self) -> bool:
        return bool(self.get('browser_ready', False))

    def set_browser_ready(self, ready: bool) -> None:
        self.set('browser_ready', ready)

    # ── Google Sheets Service ─────────────────────────────────────────────────

    def get_sheets_service(self) -> Any | None:
        return self._volatile.get('sheets_service')

    def set_sheets_service(self, service: Any) -> None:
        with self._lock:
            self._volatile['sheets_service'] = service

    # ── MIS Config ────────────────────────────────────────────────────────────

    def get_spreadsheet_id(self) -> str:
        return self.get('spreadsheet_id', '')

    def set_spreadsheet_id(self, sid: str) -> None:
        self.set('spreadsheet_id', sid)

    def get_mis_current_sheet(self) -> str:
        return self.get('mis_current_sheet', '')

    def set_mis_current_sheet(self, tab: str) -> None:
        self.set('mis_current_sheet', tab)

    def get_mis_header_row_idx(self) -> int:
        return int(self.get('mis_header_row_idx', 0))

    def set_mis_header_row_idx(self, idx: int) -> None:
        self.set('mis_header_row_idx', idx)

    def get_mis_csv_filepath(self) -> str:
        return self.get('mis_csv_filepath', '')

    def set_mis_csv_filepath(self, path: str) -> None:
        self.set('mis_csv_filepath', path)

    def get_mis_csv_filename(self) -> str:
        return self.get('mis_csv_filename', '')

    def set_mis_csv_filename(self, name: str) -> None:
        self.set('mis_csv_filename', name)

    # ── MIS Bracket / Prefix Maps (volatile — rebuilt on every sheet scan) ────

    def get_mis_bracket_map(self) -> dict[str, str]:
        return self._volatile.get('mis_bracket_map', {})

    def set_mis_bracket_map(self, m: dict[str, str]) -> None:
        with self._lock:
            self._volatile['mis_bracket_map'] = m

    def get_mis_prefix_map(self) -> dict[str, str]:
        return self._volatile.get('mis_prefix_map', {})

    def set_mis_prefix_map(self, m: dict[str, str]) -> None:
        with self._lock:
            self._volatile['mis_prefix_map'] = m

    def get_mis_rebate_type_columns(self) -> list[str]:
        return self._volatile.get('mis_rebate_type_columns', [])

    def set_mis_rebate_type_columns(self, cols: list[str]) -> None:
        with self._lock:
            self._volatile['mis_rebate_type_columns'] = cols

    # ── MIS DataFrame ─────────────────────────────────────────────────────────

    def get_mis_df(self) -> pd.DataFrame:
        df = self._volatile.get('mis_df')
        return df if df is not None else pd.DataFrame()

    def set_mis_df(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._volatile['mis_df'] = df

    # ── Google Sheet DataFrame ────────────────────────────────────────────────

    def get_google_df(self) -> pd.DataFrame:
        df = self._volatile.get('google_df')
        return df if df is not None else pd.DataFrame()

    def set_google_df(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._volatile['google_df'] = df

    # ── Brand Settings ────────────────────────────────────────────────────────

    def get_brand_settings(self) -> dict[str, str]:
        return self.get('brand_settings', {})

    def set_brand_settings(self, settings: dict[str, str]) -> None:
        self.set('brand_settings', settings)

    # ── Blaze Token ───────────────────────────────────────────────────────────

    def get_blaze_token(self) -> str | None:
        return self.get('blaze_token')

    def set_blaze_token(self, token: str) -> None:
        self.set('blaze_token', token)

    # ── Blaze DataFrame ───────────────────────────────────────────────────────

    def get_blaze_df(self) -> pd.DataFrame | None:
        return self._volatile.get('blaze_df_raw')

    def set_blaze_df(self, df: pd.DataFrame) -> None:
        with self._lock:
            self._volatile['blaze_df_raw'] = df

    # ── Blaze Inventory ───────────────────────────────────────────────────────

    def get_blaze_inventory_df(self) -> pd.DataFrame | None:
        return self._volatile.get('blaze_inventory_data')

    def set_blaze_inventory_df(self, df: pd.DataFrame | None) -> None:
        with self._lock:
            self._volatile['blaze_inventory_data'] = df

    def get_blaze_inventory_cache(self) -> dict:
        return self._volatile.get('blaze_inventory_cache', {})

    def set_blaze_inventory_cache(self, cache: dict) -> None:
        with self._lock:
            self._volatile['blaze_inventory_cache'] = cache

    def update_blaze_inventory_cache_store(self, store: str, entry: dict) -> None:
        """Thread-safe update of a single store entry in the inventory cache."""
        with self._lock:
            self._volatile['blaze_inventory_cache'][store] = entry

    # ── Automation State ──────────────────────────────────────────────────────

    def get_automation_in_progress(self) -> bool:
        return bool(self.get('automation_in_progress', False))

    def set_automation_in_progress(self, flag: bool) -> None:
        self.set('automation_in_progress', flag)

    # ── Sections Data ─────────────────────────────────────────────────────────

    def get_sections_data(self) -> dict:
        return self.get('sections_data', {})

    def set_sections_data(self, data: dict) -> None:
        self.set('sections_data', data)

    # ── Backend Delegation (swap backends in storage_backends.py, not here) ──

    def _db_get(self, key: str) -> str | None:
        return self._backend.get(key)

    def _db_set(self, key: str, value: str) -> None:
        self._backend.set(key, value)

    def _db_delete(self, key: str) -> None:
        self._backend.delete(key)

    def _init_db(self) -> None:
        # Kept for backward compatibility — backend.init() is called in __init__ instead.
        pass


    # ── Convenience aliases / missing stubs ─────────────────────────────────

    def is_browser_ready(self) -> bool:
        return self.get_browser_ready()

    def set_mis_credentials(self, creds: dict) -> None:
        import json
        self.set('mis_credentials', json.dumps(creds))

    def get_mis_credentials(self) -> dict:
        import json
        raw = self.get('mis_credentials', '{}')
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def set_blaze_credentials(self, creds: dict) -> None:
        import json
        self.set('blaze_credentials', json.dumps(creds))

    def get_blaze_credentials(self) -> dict:
        import json
        raw = self.get('blaze_credentials', '{}')
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def get_active_profile(self) -> dict:
        """Return the active profile config dict (set at startup)."""
        import json
        raw = self.get('active_profile', '{}')
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def set_active_profile(self, config: dict) -> None:
        """Persist the active profile config into session store."""
        import json
        self.set('active_profile', json.dumps({
            k: str(v) if v is not None else None
            for k, v in config.items()
        }))
        # Also expose handle as a top-level key for fast lookups
        self.set('active_profile_handle', config.get('handle') or '')

    def get_active_handle(self) -> str | None:
        """Convenience: return just the handle string."""
        return self.get('active_profile_handle') or None
