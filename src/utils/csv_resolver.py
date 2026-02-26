# src/utils/csv_resolver.py
# ─────────────────────────────────────────────────────────────────────────────
# Resolves the MIS CSV source for routes that need it.
# Priority: uploaded file → session pulled CSV → most recent in reports dir.
# Adapted from monolith (main_-_bloat.py) lines 25548, 26066, 26277.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import io
from pathlib import Path
from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    from src.session.manager import SessionManager

_MIS_REPORTS_DIR = Path(__file__).resolve().parent.parent.parent / 'reports' / 'MIS_CSV_REPORTS'


def _load_mis_csv(path: Path | str) -> pd.DataFrame | None:
    """Load a MIS CSV file into a DataFrame. Returns None on failure."""
    try:
        df = pd.read_csv(path, encoding='utf-8-sig', dtype=str).fillna('')
        if df.empty:
            return None
        return df
    except Exception as e:
        print(f"[CSV-RESOLVER] Failed to load {path}: {e}")
        return None


def resolve_mis_csv_for_route(
    csv_file_obj=None,
    session: "SessionManager | None" = None,
) -> pd.DataFrame | None:
    """
    Resolve MIS CSV from the best available source for a Flask route.

    Priority:
      1. Uploaded file object (request.files)
      2. Session-stored pulled CSV path
      3. Most recently modified CSV in MIS_CSV_REPORTS dir

    Returns a DataFrame or None if no CSV is available.
    """
    # ── 1. Uploaded file ─────────────────────────────────────────────────────
    if csv_file_obj and csv_file_obj.filename:
        try:
            content = csv_file_obj.read()
            df = pd.read_csv(io.BytesIO(content), encoding='utf-8-sig', dtype=str).fillna('')
            if not df.empty:
                print(f"[CSV] Using uploaded CSV: {csv_file_obj.filename}")
                return df
        except Exception as e:
            print(f"[CSV-RESOLVER] Failed to parse uploaded CSV: {e}")

    # ── 2. Session pulled CSV ─────────────────────────────────────────────────
    if session is not None:
        filepath = session.get('mis_csv_filepath')
        filename = session.get('mis_csv_filename', '')
        if filepath and Path(filepath).exists():
            df = _load_mis_csv(filepath)
            if df is not None:
                print(f"[CSV] Using session pulled CSV: {filename}")
                return df

    # ── 3. Most recent file in reports dir ───────────────────────────────────
    if _MIS_REPORTS_DIR.exists():
        csv_files = sorted(
            _MIS_REPORTS_DIR.glob('*.csv'),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if csv_files:
            df = _load_mis_csv(csv_files[0])
            if df is not None:
                print(f"[CSV] Using most recent report: {csv_files[0].name}")
                return df

    print("[CSV-RESOLVER] No MIS CSV available from any source.")
    return None


# Alias — matches the import name used in src/utils/__init__.py
resolve_mis_csv = resolve_mis_csv_for_route


_SYNC_KEYS_FILE = Path(__file__).resolve().parent.parent.parent / 'secrets' / 'sync_keys.json'


def load_sync_keys(store_name: str) -> dict | None:
    """
    Load store UUID for Blaze Ecom Sync from secrets/sync_keys.json.

    JSON structure:
        {
            "DAVIS": {"store_uuid": "e70c671b-..."},
            "DIXON": {"store_uuid": "a6122a4f-..."}
        }

    Returns dict with 'store_uuid' if found, None otherwise.
    Monolith: line 2427.
    """
    import json as _json
    try:
        if not _SYNC_KEYS_FILE.exists():
            print(f"[ECOM-SYNC] ⚠ Sync keys file not found: {_SYNC_KEYS_FILE}")
            return None
        with open(_SYNC_KEYS_FILE, 'r') as f:
            all_keys = _json.load(f)
        store_upper = store_name.upper().strip()
        if store_upper not in all_keys:
            print(f"[ECOM-SYNC] ⚠ No UUID found for store: {store_name}")
            return None
        store_data = all_keys[store_upper]
        if 'store_uuid' not in store_data:
            print(f"[ECOM-SYNC] ⚠ Missing store_uuid for store: {store_name}")
            return None
        print(f"[ECOM-SYNC] ✓ Loaded UUID for store: {store_name}")
        return store_data
    except _json.JSONDecodeError as e:
        print(f"[ECOM-SYNC] ✗ Invalid JSON in sync_keys.json: {e}")
        return None
    except Exception as e:
        print(f"[ECOM-SYNC] ✗ Error loading sync keys: {e}")
        return None
