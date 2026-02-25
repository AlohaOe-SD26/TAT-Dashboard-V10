# src/utils/location_helpers.py
# ─────────────────────────────────────────────────────────────────────────────
# Location/store name utilities extracted from main_-_bloat.py.
# GLOBAL_DATA references replaced with session calls (Issue C-2).
# normalize_store_name is the CANONICAL definition for the entire codebase (M-4).
# All other modules should import from here.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
from typing import Tuple, Optional

import pandas as pd

# ── Store constants (monolith: lines 2803–2856) ───────────────────────────────

STORE_MAPPING: dict[str, str] = {
    # Raw "The Artist Tree - X" → canonical Google Sheet name
    "The Artist Tree - West Hollywood": "West Hollywood",
    "The Artist Tree - Beverly Hills":  "Beverly Hills",
    "The Artist Tree - Beverly":        "Beverly Hills",
    "The Artist Tree - Koreatown":      "Koreatown",
    "The Artist Tree - Riverside":      "Riverside",
    "The Artist Tree - Fresno":         "Fresno (Palm)",
    "The Artist Tree - Fresno Palm":    "Fresno (Palm)",
    "The Artist Tree - Fresno Shaw":    "Fresno (Shaw)",
    "The Artist Tree - Oxnard":         "Oxnard",
    "The Artist Tree - El Sobrante":    "El Sobrante",
    "The Artist Tree - Laguna Woods":   "Laguna Woods",
    "The Artist Tree - Hawthorne":      "Hawthorne",
    "The Artist Tree - Dixon":          "Dixon",
    "The Artist Tree - Davis":          "Davis",
    # Short MIS CSV variations
    "West Hollywood":  "West Hollywood",
    "Beverly":         "Beverly Hills",
    "Beverly Hills":   "Beverly Hills",
    "Koreatown":       "Koreatown",
    "Riverside":       "Riverside",
    "Fresno":          "Fresno (Palm)",
    "Fresno Palm":     "Fresno (Palm)",
    "Fresno (Palm)":   "Fresno (Palm)",
    "Fresno Shaw":     "Fresno (Shaw)",
    "Fresno (Shaw)":   "Fresno (Shaw)",
    "Oxnard":          "Oxnard",
    "El Sobrante":     "El Sobrante",
    "Laguna Woods":    "Laguna Woods",
    "Hawthorne":       "Hawthorne",
    "Dixon":           "Dixon",
    "Davis":           "Davis",
}

_STORE_MAPPING_LOWER: dict[str, str] = {k.lower(): v for k, v in STORE_MAPPING.items()}

ALL_STORES_SET: frozenset[str] = frozenset([
    "Davis", "Dixon", "Beverly Hills", "El Sobrante",
    "Fresno (Palm)", "Fresno (Shaw)", "Hawthorne",
    "Koreatown", "Laguna Woods", "Oxnard",
    "Riverside", "West Hollywood",
])

ALL_STORES:        list[str] = sorted(ALL_STORES_SET)
ALL_LOCATIONS:     list[str] = ALL_STORES       # legacy alias
CSV_TARGET_STORES: list[str] = ALL_STORES       # legacy alias


# ── Monolith: line 2855 ───────────────────────────────────────────────────────

def normalize_store_name(raw_name: str) -> str:
    """
    Normalize any MIS/raw store name to canonical Google Sheet name.
    'The Artist Tree - Fresno Shaw' → 'Fresno (Shaw)'.
    CANONICAL definition — all other modules must import from here.
    Monolith: line 2855.
    """
    if not raw_name:
        return raw_name
    clean = str(raw_name).strip()
    if not clean:
        return clean
    if clean in STORE_MAPPING:
        return STORE_MAPPING[clean]
    clean_lower = clean.lower()
    if clean_lower in _STORE_MAPPING_LOWER:
        return _STORE_MAPPING_LOWER[clean_lower]
    stripped = re.sub(
        r"^(The Artist Tree|Davisville Business Enterprises,?\s*Inc\.?|Club 420)\s*[-\u2013\u2014]?\s*",
        "", clean, flags=re.IGNORECASE
    ).strip()
    if stripped in STORE_MAPPING:
        return STORE_MAPPING[stripped]
    if stripped.lower() in _STORE_MAPPING_LOWER:
        return _STORE_MAPPING_LOWER[stripped.lower()]
    return stripped


# ── Monolith: line 2886 ───────────────────────────────────────────────────────

def _extract_except_stores(text: str) -> list | None:
    """
    Extract exception store names from text containing 'Except:' anywhere.
    Returns sorted list of canonical store names, or None if no 'except' pattern.
    Monolith: line 2886.
    """
    m = re.search(r'all\s+locations[\s(]*except[):\s]*(.+)', text, re.IGNORECASE)
    if not m:
        return None
    raw_part = m.group(1).strip().strip('()[] \t')
    if not raw_part:
        return []
    result: list = []
    for segment in raw_part.split(','):
        seg = segment.strip().strip('()[] \t')
        if not seg:
            continue
        normed = normalize_store_name(seg)
        if normed in ALL_STORES_SET:
            result.append(normed)
            continue
        for sep in [' - ', ' | ', ' (', ';']:
            if sep in seg:
                prefix = seg.split(sep)[0].strip()
                normed_prefix = normalize_store_name(prefix)
                if normed_prefix in ALL_STORES_SET:
                    result.append(normed_prefix)
                    break
    return sorted(set(result))


# ── Monolith: line 2924 ───────────────────────────────────────────────────────

def normalize_location_string(loc_str: str) -> str:
    """
    Normalize a full MIS location string to canonical Google Sheet format.
    Applies normalize_store_name() to every individual store.
    Monolith: line 2924.
    """
    if not loc_str or str(loc_str).strip().lower() in ('', 'nan', 'none', '-', 'n/a', 'nat'):
        return "All Locations"
    s = str(loc_str).strip()
    except_stores = _extract_except_stores(s)
    if except_stores is not None:
        if except_stores:
            return f"All Locations Except: {', '.join(except_stores)}"
        return "All Locations"
    if s.lower() in ('all locations', 'all'):
        return "All Locations"
    stores = sorted({normalize_store_name(st.strip()) for st in s.split(',') if st.strip()})
    if set(stores) == ALL_STORES_SET:
        return "All Locations"
    return ', '.join(stores)


# ── Monolith: line 2340 ───────────────────────────────────────────────────────

def resolve_to_store_set(location_string: str) -> frozenset:
    """
    Convert any location string to a normalized frozenset of canonical store names.
    Used for set-based comparison: if sets match → MATCH.
    Monolith: line 2340.
    """
    if not location_string or str(location_string).strip().lower() in (
            '', 'nan', 'none', '-', 'n/a', 'not specified'):
        return frozenset(ALL_STORES_SET)
    s = str(location_string).strip()
    except_stores = _extract_except_stores(s)
    if except_stores is not None:
        included = ALL_STORES_SET - frozenset(except_stores)
        return frozenset(included) if included else frozenset(ALL_STORES_SET)
    if s.lower() in ('all locations', 'all'):
        return frozenset(ALL_STORES_SET)
    stores = {normalize_store_name(st.strip()) for st in s.split(',') if st.strip()}
    stores &= ALL_STORES_SET
    return frozenset(stores) if stores else frozenset(ALL_STORES_SET)


# ── Monolith: line 5123 ───────────────────────────────────────────────────────

def format_location_display(locations: str, exceptions: str) -> str:
    """
    Format location + exceptions into display string.
    'All Locations Except: X, Y' (no parentheses) for downstream set-matching.
    Monolith: line 5123.
    """
    if pd.isna(locations) or not str(locations).strip():
        return "Not Specified"
    loc_str = str(locations).strip()
    exc_str = str(exceptions).strip() if pd.notna(exceptions) else ""
    if exc_str:
        exc_parts = [normalize_store_name(e.strip()) for e in exc_str.split(',') if e.strip()]
        return f"All Locations Except: {', '.join(sorted(set(exc_parts)))}"
    return loc_str


# ── Monolith: line 6460 — GLOBAL_DATA → session (Issue C-2) ─────────────────

def resolve_location_columns(row: pd.Series) -> Tuple[str, str]:
    """
    Logic router for location columns.
    v12.27.0: Checks [Store] bracket alias first.
    GLOBAL_DATA['mis']['bracket_map'] replaced with session.get_mis_bracket_map().
    Monolith: line 6460.
    """
    # C-2 fix: replaced GLOBAL_DATA.get('mis', {}).get('bracket_map', {})
    from src.session import session
    bracket_map: dict = session.get_mis_bracket_map() or {}
    bracket_store_col = bracket_map.get('[Store]')

    master_col_name   = None
    fallback_locs_col = None

    if bracket_store_col and bracket_store_col in row.index:
        master_col_name = bracket_store_col
        print(f"[LOCATION] v12.27.0: Using [Store] bracket → column '{bracket_store_col}'")

    debug_cols = [str(c) for c in row.index]
    if not getattr(resolve_location_columns, '_logged_cols', None) == debug_cols:
        resolve_location_columns._logged_cols = debug_cols
        print(f"[LOCATION-DEBUG] Available columns: {debug_cols}")

    if master_col_name is None:
        for col in row.index:
            col_str = str(col)
            c_lower = col_str.lower().replace('\n', ' ')
            if '(discount applies at)' in c_lower:
                master_col_name = col
                print(f"[LOCATION] Found primary match: '{col_str}'")
                break
            if master_col_name is None and 'discount' in c_lower and 'applies' in c_lower:
                master_col_name = col
                print(f"[LOCATION] Found secondary match: '{col_str}'")
            if fallback_locs_col is None:
                if 'locations' in c_lower and 'marketing' not in c_lower:
                    parts = c_lower.split()
                    if parts and 'locations' in parts[0]:
                        fallback_locs_col = col
                        print(f"[LOCATION] Found fallback column: '{col_str}'")

    if master_col_name is None and fallback_locs_col is not None:
        master_col_name = fallback_locs_col
        print(f"[LOCATION] Using fallback: {master_col_name}")

    if master_col_name is None:
        print("[LOCATION-WARNING] No location column found!")

    master_val   = str(row[master_col_name]).strip() if master_col_name else ""
    master_clean = master_val.lower()

    # BRANCH 1: "Same as Marketing"
    if "same as market" in master_clean:
        marketing_col = None
        for col in row.index:
            c = str(col).lower()
            if 'marketing' in c and 'location' in c:
                marketing_col = col
                break
        if marketing_col:
            mval   = str(row[marketing_col]).strip()
            mclean = mval.lower()
            if "same as market" in mclean:
                print(f"[ERROR] Circular 'Same as Marketing' at row {row.name + 1}")
                return "", ""
            temp = row.copy()
            temp[master_col_name] = mval
            return resolve_location_columns(temp)
        else:
            print(f"[ERROR] 'Same as Marketing' but no Marketing col at row {row.name + 1}")
            return "", ""

    # BRANCH 2: Empty / NaN
    if not master_val or master_clean == 'nan':
        return "", ""

    # BRANCH 3: "All Locations Except"
    if "all locations except" in master_clean:
        cleaned    = master_val.replace("All Locations Except:", "").replace("all locations except:", "")
        exceptions = [loc.strip() for loc in cleaned.split(',') if loc.strip()]
        return "All Locations", ", ".join(exceptions)

    # BRANCH 4: "All Locations"
    if master_clean == "all locations":
        return "All Locations", ""

    # BRANCH 5: Specific list
    return master_val, ""
