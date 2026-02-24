# =============================================================================
# src/utils/sheet_helpers.py
# Step 6: Sheet utility functions — session-aware get_col, MIS ID parsing,
# numeric helpers, and spreadsheet utilities.
#
# KEY DESIGN: get_col() is session-aware. It reads bracket_map / prefix_map
# from SessionManager rather than GLOBAL_DATA, making it multi-request safe.
# =============================================================================
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd


# ── Column Resolution ─────────────────────────────────────────────────────────

def get_col(
    row: pd.Series,
    possible_names: List[str],
    default: Any = '',
    bracket_map: Dict[str, str] | None = None,
    prefix_map: Dict[str, str] | None = None,
) -> Any:
    """
    v12.27.0: Enhanced with bracket header alias resolution + prefix fallback.
    Session-aware: accepts bracket_map and prefix_map explicitly instead of
    reading from GLOBAL_DATA — callers pass session maps in.

    Resolution order for each name in possible_names:
      1. bracket_map: '[Weekday]' → 'Weekday [Weekday]'
      2. Exact match: 'Weekday' in row.index
      3. prefix_map:  'Weekday' → 'Weekday [Weekday]' (old names → bracket col)

    Falls through to next name if current name does not resolve.
    """
    bmap = bracket_map or {}
    pmap = prefix_map or {}

    for name in possible_names:
        # 1. Bracket alias resolution
        resolved = bmap.get(name)
        if resolved and resolved in row.index:
            val = row[resolved]
            if isinstance(val, pd.Series):
                val = val.iloc[0]
            if pd.notna(val):
                return val

        # 2. Exact match
        if name in row.index:
            val = row[name]
            if isinstance(val, pd.Series):
                val = val.iloc[0]
            if pd.notna(val):
                return val

        # 3. Prefix fallback
        resolved_prefix = pmap.get(name)
        if resolved_prefix and resolved_prefix in row.index:
            val = row[resolved_prefix]
            if isinstance(val, pd.Series):
                val = val.iloc[0]
            if pd.notna(val):
                return val

    return default


def get_col_session(
    row: pd.Series,
    possible_names: List[str],
    default: Any = '',
) -> Any:
    """
    Convenience wrapper: loads bracket_map / prefix_map from SessionManager
    automatically. Use this in route handlers where session is available.
    """
    try:
        from src.session import session
        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()
    except Exception:
        bmap, pmap = {}, {}
    return get_col(row, possible_names, default, bracket_map=bmap, prefix_map=pmap)


# ── Numeric Helpers ───────────────────────────────────────────────────────────

def parse_percentage(value: Any) -> float:
    """
    Parse a percentage or float value from various string formats.
    '50%' → 50.0, '50' → 50.0, NaN → 0.0
    """
    if pd.isna(value):
        return 0.0
    val_str = str(value).strip().replace('%', '').replace(',', '')
    try:
        return float(val_str)
    except (ValueError, TypeError):
        return 0.0


# ── MIS ID Parsing ────────────────────────────────────────────────────────────

def strip_mis_id_tag(tagged_id: str) -> str:
    """
    Strip any tag prefix from a MIS ID string.
    'W1: 12345' → '12345'
    'WP: 67890' → '67890'
    'M1: 99999' → '99999'
    '12345'     → '12345'
    """
    if not tagged_id:
        return ''
    s = str(tagged_id).strip()
    if ':' in s:
        return s.split(':', 1)[1].strip()
    return s


def parse_mis_id_cell(cell_value: str, section: str | None = None) -> Dict:
    """
    Parse a Google Sheet MIS ID cell that may contain tagged IDs.

    v10.8 FORMAT (newline-separated with section-based tags):
        W1: 12345     (Weekly Original)
        WP: 67890     (Weekly Patch)
        W2: 54321     (Weekly Continuation)
        M1: 99999 / MP: 88888 / M2: 77777
        S1: 66666 / SP: 55555 / S2: 44444

    Returns dict:
        weekly:   {parts: [...], patch: str|None}
        monthly:  {parts: [...], patch: str|None}
        sale:     {parts: [...], patch: str|None}
        parts:    All parts combined (backward compat)
        patches:  All patches combined
        raw:      Original cell value
        is_tagged: True if new tagged format detected
        all_tagged: [(tag, id), ...] in order (multi-brand support)
    """
    result: Dict = {
        'weekly':   {'parts': [], 'patch': None},
        'monthly':  {'parts': [], 'patch': None},
        'sale':     {'parts': [], 'patch': None},
        'parts':    [],
        'patches':  [],
        'gaps':     [],
        'raw':      str(cell_value).strip() if cell_value else '',
        'is_tagged': False,
        'all_tagged': [],
    }

    if not cell_value or str(cell_value).strip() in ['', 'nan', 'None', '-']:
        return result

    raw = str(cell_value).strip()

    # Universal capture for multi-brand support
    universal_pattern = r'([WwMmSs])([1-9Pp])\s*:\s*(\d+)'
    for m in re.finditer(universal_pattern, raw):
        tag = f"{m.group(1).upper()}{m.group(2).upper()}"
        result['all_tagged'].append((tag, m.group(3)))

    # Weekly parts W1, W2, …
    for m in re.finditer(r'[Ww](\d+)\s*:\s*(\d+)', raw):
        pnum, mid = int(m.group(1)), m.group(2)
        while len(result['weekly']['parts']) < pnum:
            result['weekly']['parts'].append(None)
        result['weekly']['parts'][pnum - 1] = mid
        if mid not in result['parts']:
            result['parts'].append(mid)
        result['is_tagged'] = True

    # Weekly patch WP
    m = re.search(r'[Ww][Pp]\s*:\s*(\d+)', raw)
    if m:
        result['weekly']['patch'] = m.group(1)
        result['patches'].append(m.group(1))
        result['is_tagged'] = True

    # Monthly parts M1, M2, …
    for m in re.finditer(r'[Mm](\d+)\s*:\s*(\d+)', raw):
        pnum, mid = int(m.group(1)), m.group(2)
        while len(result['monthly']['parts']) < pnum:
            result['monthly']['parts'].append(None)
        result['monthly']['parts'][pnum - 1] = mid
        if mid not in result['parts']:
            result['parts'].append(mid)
        result['is_tagged'] = True

    # Monthly patch MP
    m = re.search(r'[Mm][Pp]\s*:\s*(\d+)', raw)
    if m:
        result['monthly']['patch'] = m.group(1)
        result['patches'].append(m.group(1))
        result['is_tagged'] = True

    # Sale parts S1, S2, …
    for m in re.finditer(r'[Ss](\d+)\s*:\s*(\d+)', raw):
        pnum, mid = int(m.group(1)), m.group(2)
        while len(result['sale']['parts']) < pnum:
            result['sale']['parts'].append(None)
        result['sale']['parts'][pnum - 1] = mid
        if mid not in result['parts']:
            result['parts'].append(mid)
        result['is_tagged'] = True

    # Sale patch SP
    m = re.search(r'[Ss][Pp]\s*:\s*(\d+)', raw)
    if m:
        result['sale']['patch'] = m.group(1)
        result['patches'].append(m.group(1))
        result['is_tagged'] = True

    # Legacy: Part 1, Part 2, …
    for m in re.finditer(r'[Pp]art\s*(\d+)\s*:\s*(\d+)', raw):
        pnum, mid = int(m.group(1)), m.group(2)
        while len(result['weekly']['parts']) < pnum:
            result['weekly']['parts'].append(None)
        if result['weekly']['parts'][pnum - 1] is None:
            result['weekly']['parts'][pnum - 1] = mid
        if mid not in result['parts']:
            result['parts'].append(mid)
        result['is_tagged'] = True

    # Legacy: GAP
    for m in re.finditer(r'[Gg][Aa][Pp]\s*:\s*(\d+)', raw):
        result['gaps'].append(m.group(1))
        result['is_tagged'] = True

    # Legacy: Patch (no section prefix)
    m = re.search(r'[Pp]atch\s*:\s*(\d+)', raw)
    if m and result['weekly']['patch'] is None:
        result['weekly']['patch'] = m.group(1)
        result['patches'].append(m.group(1))
        result['is_tagged'] = True

    # Plain numeric ID (no tags)
    if not result['is_tagged']:
        m = re.match(r'^(\d{5,7})$', raw)
        if m:
            mid = m.group(1)
            result['weekly']['parts'].append(mid)
            result['parts'].append(mid)

    # Remove None sentinels
    result['weekly']['parts']  = [p for p in result['weekly']['parts']  if p is not None]
    result['monthly']['parts'] = [p for p in result['monthly']['parts'] if p is not None]
    result['sale']['parts']    = [p for p in result['sale']['parts']    if p is not None]
    result['part1'] = result['parts'][0] if result['parts'] else None

    return result


# ── Category Helpers ──────────────────────────────────────────────────────────

def format_csv_categories(cat_raw: str, exc_raw: str) -> str:
    """
    Format category string for MIS CSV output.
    'All Categories' → 'All Categories' (loop strips for actual CSV cell)
    'Flower' → 'Flower'
    """
    cat_str = str(cat_raw).strip()
    exc_str = str(exc_raw).strip()

    if 'all categories' in cat_str.lower():
        if exc_str and exc_str.lower() not in ('nan', 'none', ''):
            return f'All Categories (Except: {exc_str})'
        return 'All Categories'

    if not cat_str or cat_str.lower() in ('nan', 'none'):
        return ''
    return ', '.join(c.strip() for c in cat_str.split(',') if c.strip())


# ── Spreadsheet Utilities ─────────────────────────────────────────────────────

def extract_spreadsheet_id(url: str) -> Optional[str]:
    """Extract Google Sheets ID from a spreadsheet URL."""
    m = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url)
    return m.group(1) if m else None


def detect_header_row(sheet_data: List[List[str]]) -> int:
    """
    Detect header row index by scanning for key column name keywords.
    Scans first 10 rows; returns 0 as safe fallback.
    """
    key_columns = ['Brand', 'Weekday', 'Deal', 'Discount', 'Location']
    for row_idx, row in enumerate(sheet_data[:10]):
        row_str = ' '.join(str(cell).strip() for cell in row).lower()
        matches = sum(1 for kw in key_columns if kw.lower() in row_str)
        if matches >= 3:
            return row_idx
    return 0


def get_col_letter(n: int) -> str:
    """Convert 0-based column index to Excel-style letter (0→A, 25→Z, 26→AA)."""
    string = ''
    while n >= 0:
        string = chr((n % 26) + 65) + string
        n = (n // 26) - 1
    return string


def resolve_rebate_type(
    row: pd.Series,
    rebate_type_columns: list | None = None,
) -> str:
    """
    v12.27.0: Resolve Rebate Type from bracket header system.

    When [Rebate Type] appears under both 'Wholesale?' and 'Retail?' columns,
    checks which column has TRUE for the given row.

    Falls back to legacy behavior (checking 'Wholesale'/'Retail' columns directly)
    if rebate_type_columns is not provided.

    Args:
        row: A pandas Series (one Google Sheet row).
        rebate_type_columns: List of full column names that carry [Rebate Type]
            bracket headers (e.g. ['Wholesale? [Rebate type]', 'Retail? [Rebate type]']).
            Pass session.get_mis_rebate_type_columns() from route layer.

    Returns: 'Wholesale', 'Retail', or '' if neither/both/ambiguous.
    """
    truthy_values = {'TRUE', 'YES', '1', 'X', '✔', 'CHECKED'}

    if rebate_type_columns:
        results: dict[str, bool] = {}
        for col_name in rebate_type_columns:
            if col_name in row.index:
                raw_val = row[col_name]
                if hasattr(raw_val, 'iloc'):
                    raw_val = raw_val.iloc[0] if len(raw_val) > 0 else ''
                val = str(raw_val).strip().upper()
                is_true = val in truthy_values
                col_lower = col_name.lower()
                if 'wholesale' in col_lower:
                    results['Wholesale'] = is_true
                elif 'retail' in col_lower:
                    results['Retail'] = is_true

        is_ws  = results.get('Wholesale', False)
        is_ret = results.get('Retail', False)

        if is_ws and not is_ret:
            return 'Wholesale'
        if is_ret and not is_ws:
            return 'Retail'
        return ''  # both or neither

    # Legacy fallback: check Wholesale/Retail columns directly
    wholesale_val = str(get_col(row, ['Wholesale', 'Wholesale?'], '')).strip().upper()
    retail_val    = str(get_col(row, ['Retail', 'Retail?'], '')).strip().upper()
    is_ws  = wholesale_val in truthy_values
    is_ret = retail_val in truthy_values
    if is_ws and not is_ret:
        return 'Wholesale'
    if is_ret and not is_ws:
        return 'Retail'
    return ''
