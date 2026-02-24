# =============================================================================
# src/utils/csv_resolver.py
# Step 3: Single authoritative MIS CSV loader — eliminates 6x duplication.
# Priority chain:
#   1. config/profiles/<handle>/mis_export.csv  (profile-specific)
#   2. config/profiles/<handle>/mis_*.csv       (any MIS export in profile dir)
#   3. BASE_DIR / mis_export.csv                (legacy root fallback)
#   4. BASE_DIR / mis_*.csv                     (any root-level MIS CSV)
# =============================================================================
import glob
from pathlib import Path
from typing import Optional
import pandas as pd


def load_sync_keys(store_name: str) -> dict | None:
    """
    v12.24.1: Load store UUID for Blaze Ecom Sync from secrets/sync_keys.json.
    
    Args:
        store_name: The store name (e.g., 'DAVIS', 'DIXON')
    
    Returns:
        dict with 'store_uuid' if found, None otherwise
    
    JSON Structure Expected:
        {
            "DAVIS": {"store_uuid": "e70c671b-8954-4524-a021-cd00a5e6b3a0"},
            "DIXON": {"store_uuid": "a6122a4f-47c9-44b9-b50b-3c1e4934c72f"}
        }
    """
    try:
        if not SYNC_KEYS_FILE.exists():
            print(f"[ECOM-SYNC] ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Sync keys file not found: {SYNC_KEYS_FILE}")
            return None
        
        with open(SYNC_KEYS_FILE, 'r') as f:
            all_keys = json.load(f)
        
        # Normalize store name for lookup (uppercase)
        store_upper = store_name.upper().strip()
        
        if store_upper not in all_keys:
            print(f"[ECOM-SYNC] ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â No UUID found for store: {store_name}")
            return None
        
        store_data = all_keys[store_upper]
        
        # Validate required field
        if 'store_uuid' not in store_data:
            print(f"[ECOM-SYNC] ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Missing store_uuid for store: {store_name}")
            return None
        
        print(f"[ECOM-SYNC] ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Loaded UUID for store: {store_name}")
        return store_data
    
    except json.JSONDecodeError as e:
        print(f"[ECOM-SYNC] ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Invalid JSON in sync_keys.json: {e}")
        return None
    except Exception as e:
        print(f"[ECOM-SYNC] ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Error loading sync keys: {e}")
        return None




def resolve_mis_csv(profile_dir: Path | None = None, base_dir: Path | None = None) -> Optional[pd.DataFrame]:
    """
    Single authoritative MIS CSV loader. Replaces 6 duplicated load patterns
    in the monolith. Called by SessionManager.get_mis_df() if cache is empty.

    Priority chain (highest → lowest):
      1. profile_dir / mis_export.csv
      2. profile_dir / mis_*.csv  (glob, newest by mtime)
      3. base_dir / mis_export.csv
      4. base_dir / mis_*.csv     (glob, newest by mtime)

    Args:
        profile_dir: Path to the active profile directory (e.g. config/profiles/TAT/)
        base_dir:    Repo root fallback directory

    Returns:
        pandas DataFrame if a CSV is found and parseable, else None.
    """
    candidates: list[Path] = []

    def _glob_newest(directory: Path, pattern: str) -> list[Path]:
        matches = list(directory.glob(pattern))
        return sorted(matches, key=lambda p: p.stat().st_mtime, reverse=True)

    if profile_dir and profile_dir.exists():
        exact = profile_dir / 'mis_export.csv'
        if exact.exists():
            candidates.append(exact)
        candidates.extend(_glob_newest(profile_dir, 'mis_*.csv'))

    if base_dir and base_dir.exists():
        exact = base_dir / 'mis_export.csv'
        if exact.exists():
            candidates.append(exact)
        candidates.extend(_glob_newest(base_dir, 'mis_*.csv'))

    # Deduplicate while preserving order
    seen: set[Path] = set()
    unique: list[Path] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    for path in unique:
        try:
            df = pd.read_csv(path, dtype=str, encoding='utf-8', na_filter=False)
            print(f"[CSV] Loaded MIS CSV: {path.name} ({len(df)} rows)")
            return df
        except Exception as e:
            print(f"[CSV] Failed to load {path}: {e}")
            continue

    print("[CSV] WARNING: No MIS CSV found. Session will have empty mis_df.")
    return None


def resolve_mis_csv_for_route(
    csv_file_obj=None,
    local_path: str | None = None,
    session=None,
    profile_dir=None,
    base_dir=None,
) -> "Optional[pd.DataFrame]":
    """
    Route-layer CSV resolver: handles all 3 source priorities in one call.

    Priority:
      1. Uploaded CSV file (from request.files)
      2. local_path string (from form POST)
      3. session.get_mis_csv_filepath() (previously pulled CSV)
      4. resolve_mis_csv(profile_dir, base_dir) file-system fallback

    This is the function imported as `resolve_mis_csv` in route files.
    The original resolve_mis_csv() is preserved for SessionManager use.

    Args:
        csv_file_obj: werkzeug FileStorage or file-like object
        local_path:   Absolute path string to CSV on disk
        session:      SessionManager instance
        profile_dir:  Passed to resolve_mis_csv() fallback
        base_dir:     Passed to resolve_mis_csv() fallback

    Returns pandas DataFrame or None.
    """
    from pathlib import Path
    import pandas as pd

    # 1. Uploaded file
    if csv_file_obj is not None:
        try:
            df = pd.read_csv(csv_file_obj, dtype=str, na_filter=False)
            print("[CSV] Using uploaded CSV file")
            return df
        except Exception as e:
            print(f"[CSV] Uploaded CSV parse error: {e}")

    # 2. local_path from form
    if local_path:
        p = Path(local_path)
        if p.exists():
            try:
                df = pd.read_csv(p, dtype=str, na_filter=False)
                print(f"[CSV] Using local path: {p.name}")
                return df
            except Exception as e:
                print(f"[CSV] local_path parse error: {e}")

    # 3. Session pulled CSV
    if session is not None:
        pulled_path = session.get_mis_csv_filepath() if hasattr(session, 'get_mis_csv_filepath') else None
        if pulled_path:
            p = Path(pulled_path)
            if p.exists():
                try:
                    df = pd.read_csv(p, dtype=str, na_filter=False)
                    print(f"[CSV] Using session pulled CSV: {p.name}")
                    return df
                except Exception as e:
                    print(f"[CSV] Session CSV parse error: {e}")

    # 4. File-system fallback
    return resolve_mis_csv(profile_dir, base_dir)
