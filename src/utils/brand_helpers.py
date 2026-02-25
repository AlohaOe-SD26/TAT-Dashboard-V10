# src/utils/brand_helpers.py
# ─────────────────────────────────────────────────────────────────────────────
# Brand utility helpers extracted from main_-_bloat.py.
# GLOBAL_DATA references replaced with authenticate_google_sheets() (Issue C-1).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
import traceback
from pathlib import Path
from typing import Dict, List, Optional, Any

import pandas as pd

# ── Constants ─────────────────────────────────────────────────────────────────
_PROJECT_ROOT  = Path(__file__).resolve().parent.parent.parent
BRAND_LIST_FILE = _PROJECT_ROOT / 'brand_list.txt'


# ── Monolith: line 5080 ───────────────────────────────────────────────────────

def manage_brand_list(mis_df: pd.DataFrame) -> List[str]:
    """Manage brand list — merge MIS brands into persisted brand_list.txt."""
    stored_brands: set = set()
    if BRAND_LIST_FILE.exists():
        try:
            with open(BRAND_LIST_FILE, 'r', encoding='utf-8') as f:
                stored_brands = {line.strip() for line in f if line.strip()}
        except Exception:
            pass

    mis_brands: set = set()
    if 'Brand' in mis_df.columns:
        mis_brands = {str(b).strip() for b in mis_df['Brand'].dropna().unique() if str(b).strip()}

    new_brands = mis_brands - stored_brands
    if new_brands:
        updated = stored_brands.union(new_brands)
        try:
            with open(BRAND_LIST_FILE, 'w', encoding='utf-8') as f:
                for brand in sorted(updated, key=str.lower):
                    f.write(f"{brand}\n")
        except Exception:
            pass
        return list(updated)
    return list(stored_brands)


# ── Monolith: line 6208 ───────────────────────────────────────────────────────

def load_brand_settings(spreadsheet_id: str) -> Dict[str, str]:
    """
    Read the 'Brand Rebate Agreements' (or 'Settings') tab to build
    a map of Brand → Linked Brand.
    GLOBAL_DATA['sheets_service'] replaced with authenticate_google_sheets().
    Monolith: line 6208.
    """
    settings_map: Dict[str, str] = {}
    try:
        from src.integrations.google_sheets import authenticate_google_sheets
        service = authenticate_google_sheets()
        if not service:
            return {}

        metadata     = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        settings_tab = None

        print("\n[DEBUG] --- Loading Brand Settings ---")
        for s in metadata.get('sheets', []):
            title = s['properties']['title']
            if 'brand rebate' in title.lower() or 'rebate agreement' in title.lower():
                settings_tab = title
                print(f"[DEBUG] Found Brand Rebate Agreements tab: '{title}'")
                break

        if not settings_tab:
            for s in metadata.get('sheets', []):
                title = s['properties']['title']
                if 'setting' in title.lower():
                    settings_tab = title
                    print(f"[DEBUG] Fallback to settings tab: '{title}'")
                    break

        if not settings_tab:
            print("[WARN] Could not find 'Brand Rebate Agreements' or 'Settings' tab.")
            return {}

        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{settings_tab}'!A1:Z1000"
        ).execute()
        rows = result.get('values', [])
        if not rows:
            return {}

        brand_idx  = -1
        linked_idx = -1
        start_row  = 0

        for i, row in enumerate(rows[:10]):
            row_lower = [str(x).strip().lower() for x in row]
            for ci, val in enumerate(row_lower):
                if 'linked' in val and 'brand' in val:
                    linked_idx = ci
                    break
            for ci, val in enumerate(row_lower):
                if 'brand' in val and 'linked' not in val and 'contribution' not in val:
                    brand_idx = ci
                    break
            if brand_idx != -1 and linked_idx != -1:
                start_row = i + 1
                print(f"[DEBUG] Headers row {i+1}: Brand={brand_idx}, Linked={linked_idx}")
                break

        if brand_idx == -1 or linked_idx == -1:
            print(f"[WARN] Failed to find headers in '{settings_tab}'.")
            return {}

        count = 0
        for r in rows[start_row:]:
            if len(r) > brand_idx:
                b_name = str(r[brand_idx]).strip()
                l_name = str(r[linked_idx]).strip() if len(r) > linked_idx else ''
                if b_name:
                    settings_map[b_name.lower()] = l_name
                    count += 1

        print(f"[INFO] Successfully loaded {count} brand rules.")
        return settings_map

    except Exception as e:
        print(f"[ERROR] Failed to load settings: {e}")
        traceback.print_exc()
        return {}


# ── Monolith: line 32644 ──────────────────────────────────────────────────────

def parse_multi_brand(brand_str: str) -> List[str]:
    """
    Parse a brand string that may contain multiple brands.
    v12.2: Preserves brands with legitimate '&' (Papa & Barkley, Hash & Flowers).
    Monolith: line 32644.
    """
    if not brand_str or str(brand_str).strip() in ('', 'nan', 'None', '-'):
        return []

    brand_str = str(brand_str).strip()

    AMPERSAND_BRANDS = ['Papa & Barkley', 'Hash & Flowers']
    preserved: dict = {}
    for i, ab in enumerate(AMPERSAND_BRANDS):
        placeholder = f"__AMPERSAND_BRAND_{i}__"
        pattern = re.compile(re.escape(ab), re.IGNORECASE)
        if pattern.search(brand_str):
            match = pattern.search(brand_str)
            preserved[placeholder] = match.group(0)
            brand_str = pattern.sub(placeholder, brand_str)

    normalized = re.sub(r'\s*/\s*', ', ', brand_str)
    brands = [b.strip() for b in normalized.split(',') if b.strip()]

    result: List[str] = []
    for b in brands:
        for placeholder, original in preserved.items():
            b = b.replace(placeholder, original)
        result.append(b)
    return result


def is_multi_brand(brand_str: str) -> bool:
    return len(parse_multi_brand(brand_str)) > 1


# ── Monolith: line 32886 ──────────────────────────────────────────────────────

def strip_mis_id_tag(tagged_id: str) -> str:
    """Strip tag prefix from a MIS ID. Monolith: line 32996."""
    if not tagged_id:
        return ''
    tagged_id = str(tagged_id).strip()
    if ':' in tagged_id:
        return tagged_id.split(':', 1)[1].strip()
    return tagged_id


def update_tagged_mis_cell(
    existing_content: str, tag: str, new_id: str, append_mode: bool = False
) -> str:
    """
    Update a specific tag in a MIS ID cell, preserving other content.
    Monolith: line 32886.
    """
    if not new_id or not new_id.strip():
        return existing_content

    new_id    = str(new_id).strip()
    tag_lower = tag.lower().strip()
    new_id    = strip_mis_id_tag(new_id)

    existing_lines = []
    if existing_content:
        existing_lines = [l.strip() for l in
                          existing_content.replace('\r\n', '\n').split('\n') if l.strip()]

    TAG_MAP: dict[str, tuple[str, str]] = {
        'w1':  ('W1', 'w1'), 'weekly1': ('W1', 'w1'), 'weekly_1': ('W1', 'w1'),
        'w2':  ('W2', 'w2'), 'weekly2': ('W2', 'w2'), 'weekly_2': ('W2', 'w2'),
        'w3':  ('W3', 'w3'), 'weekly3': ('W3', 'w3'), 'weekly_3': ('W3', 'w3'),
        'wp':  ('WP', 'wp'), 'weekly_patch': ('WP', 'wp'), 'weeklypatch': ('WP', 'wp'),
        'm1':  ('M1', 'm1'), 'monthly1': ('M1', 'm1'), 'monthly_1': ('M1', 'm1'),
        'm2':  ('M2', 'm2'), 'monthly2': ('M2', 'm2'), 'monthly_2': ('M2', 'm2'),
        'm3':  ('M3', 'm3'), 'monthly3': ('M3', 'm3'), 'monthly_3': ('M3', 'm3'),
        'mp':  ('MP', 'mp'), 'monthly_patch': ('MP', 'mp'), 'monthlypatch': ('MP', 'mp'),
        's1':  ('S1', 's1'), 'sale1': ('S1', 's1'), 'sale_1': ('S1', 's1'),
        's2':  ('S2', 's2'), 'sale2': ('S2', 's2'), 'sale_2': ('S2', 's2'),
        's3':  ('S3', 's3'), 'sale3': ('S3', 's3'), 'sale_3': ('S3', 's3'),
        'sp':  ('SP', 'sp'), 'sale_patch': ('SP', 'sp'), 'salepatch': ('SP', 'sp'),
        'part1': ('W1', 'w1'), 'part_1': ('W1', 'w1'), 'part 1': ('W1', 'w1'),
        'part2': ('W2', 'w2'), 'part_2': ('W2', 'w2'), 'part 2': ('W2', 'w2'),
        'gap':   ('M1', 'm1'),
        'patch': ('WP', 'wp'),
    }

    prefix_label, tag_prefix = TAG_MAP.get(tag_lower, ('W1', 'w1'))
    new_line = f"{prefix_label}: {new_id}"

    found        = False
    result_lines = []
    for line in existing_lines:
        line_lower = line.lower()
        if line_lower.startswith(tag_prefix + ':') or line_lower.startswith(tag_prefix + ' :'):
            if append_mode:
                result_lines.append(line)
            else:
                result_lines.append(new_line)
                found = True
        else:
            result_lines.append(line)

    if not found or append_mode:
        result_lines.append(new_line)

    return '\n'.join(result_lines)


# ── Monolith: line 32442 ──────────────────────────────────────────────────────

def parse_mis_id_cell(cell_value: str, section: str | None = None) -> dict:
    """
    Parse a Google Sheet MIS ID cell containing tagged IDs.
    v10.8.1: Regex-based, handles any separator format.
    Monolith: line 32442.
    """
    result: dict = {
        'weekly':  {'parts': [], 'patch': None},
        'monthly': {'parts': [], 'patch': None},
        'sale':    {'parts': [], 'patch': None},
        'parts':   [], 'patches': [], 'gaps': [],
        'raw':       str(cell_value).strip() if cell_value else '',
        'is_tagged': False,
        'all_tagged': [],
    }
    if not cell_value or str(cell_value).strip() in ('', 'nan', 'None', '-'):
        return result

    raw = str(cell_value).strip()

    # Capture ALL tagged (section, part/patch, id) in order
    for m in re.finditer(r'([WwMmSs])([1-9Pp])\s*:\s*(\d+)', raw):
        result['all_tagged'].append((f"{m.group(1).upper()}{m.group(2).upper()}", m.group(3)))

    def _fill_section(key: str, letter: str) -> None:
        for m in re.finditer(rf'[{letter.upper()}{letter.lower()}](\d+)\s*:\s*(\d+)', raw):
            pn, mid = int(m.group(1)), m.group(2)
            parts = result[key]['parts']
            while len(parts) < pn:
                parts.append(None)
            parts[pn - 1] = mid
            if mid not in result['parts']:
                result['parts'].append(mid)
            result['is_tagged'] = True
        pm = re.search(rf'[{letter.upper()}{letter.lower()}][Pp]\s*:\s*(\d+)', raw)
        if pm:
            result[key]['patch'] = pm.group(1)
            result['patches'].append(pm.group(1))
            result['is_tagged'] = True

    _fill_section('weekly',  'W')
    _fill_section('monthly', 'M')
    _fill_section('sale',    'S')

    for m in re.finditer(r'[Pp]art\s*(\d+)\s*:\s*(\d+)', raw):
        pn, mid = int(m.group(1)), m.group(2)
        parts = result['weekly']['parts']
        while len(parts) < pn:
            parts.append(None)
        if parts[pn - 1] is None:
            parts[pn - 1] = mid
        if mid not in result['parts']:
            result['parts'].append(mid)
        result['is_tagged'] = True

    for m in re.finditer(r'[Gg][Aa][Pp]\s*:\s*(\d+)', raw):
        result['gaps'].append(m.group(1)); result['is_tagged'] = True

    lp = re.search(r'[Pp]atch\s*:\s*(\d+)', raw)
    if lp:
        if result['weekly']['patch'] is None:
            result['weekly']['patch'] = lp.group(1)
        if lp.group(1) not in result['patches']:
            result['patches'].append(lp.group(1))
        result['is_tagged'] = True

    if not result['is_tagged']:
        m = re.match(r'^(\d{5,7})$', raw)
        if m:
            result['weekly']['parts'].append(m.group(1))
            result['parts'].append(m.group(1))

    for k in ('weekly', 'monthly', 'sale'):
        result[k]['parts'] = [p for p in result[k]['parts'] if p is not None]

    result['part1'] = result['parts'][0] if result['parts'] else None
    return result


# ── Monolith: line 27151 ──────────────────────────────────────────────────────

def get_brand_for_mis_id(mis_id: str, mis_id_column_value: str, brands_column_value: str) -> Optional[str]:
    """
    Given a MIS ID, find which brand it corresponds to in a multi-brand row.
    S1 = first brand, S2 = second brand, etc.
    Monolith: line 27151.
    """
    if not mis_id or not mis_id_column_value or not brands_column_value:
        return None
    brands = [b.strip() for b in brands_column_value.split(',') if b.strip()]
    if not brands:
        return None
    if len(brands) == 1:
        return brands[0]
    pat = r'[SWM](\d+):\s*' + re.escape(str(mis_id).strip())
    m   = re.search(pat, mis_id_column_value, re.IGNORECASE)
    if m:
        pos = int(m.group(1)) - 1
        if 0 <= pos < len(brands):
            return brands[pos]
    try:
        ids_raw = re.sub(r'[SWM]\d+:\s*', '', mis_id_column_value)
        ids     = [i.strip() for i in ids_raw.split(',') if i.strip()]
        for idx, id_val in enumerate(ids):
            if str(mis_id).strip() == id_val and idx < len(brands):
                return brands[idx]
    except Exception:
        pass
    return None


# resolve_brand_for_match: canonical alias for get_brand_for_mis_id (v10 public API name)
def resolve_brand_for_match(mis_id: str, mis_id_column_value: str, brands_column_value: str) -> Optional[str]:
    """Public alias expected by __init__.py. Delegates to get_brand_for_mis_id. Monolith: line 27151."""
    return get_brand_for_mis_id(mis_id, mis_id_column_value, brands_column_value)


# ── Monolith: line 32711 ──────────────────────────────────────────────────────

def get_brand_from_mis_id(mis_id: str, mis_df: Any) -> Optional[str]:
    """
    Look up a MIS ID in the MIS CSV DataFrame and return the brand name.
    Monolith: line 32711.
    """
    if not mis_id or mis_df is None:
        return None
    try:
        if mis_df.empty:
            return None
    except Exception:
        return None
    mid = str(mis_id).strip()
    if mid.endswith('.0'):
        mid = mid[:-2]
    id_col = next((c for c in ('ID', 'id', 'MIS ID', 'Mis Id') if c in mis_df.columns), None)
    if not id_col:
        return None
    hits = mis_df[mis_df[id_col].astype(str).str.strip() == mid]
    if hits.empty:
        return None
    return str(hits.iloc[0].get('Brand', '')).strip() or None


# ── Monolith: line 32742 ──────────────────────────────────────────────────────

def match_mis_ids_to_brands(mis_id_cell: str, brands: List[str], mis_df: Any) -> Dict[str, List]:
    """
    Match each MIS ID in a tagged cell to its brand by looking up the MIS CSV.
    v12.2: Strict matching — prevents substring brand confusion.
    Monolith: line 32742.
    """
    try:
        from rapidfuzz import fuzz as _fuzz
    except ImportError:
        try:
            from fuzz import token_set_ratio as _tsr  # type: ignore
            class _fuzz:  # type: ignore
                @staticmethod
                def token_set_ratio(a: str, b: str) -> float:
                    return _tsr(a, b)
        except ImportError:
            class _fuzz:  # type: ignore
                @staticmethod
                def token_set_ratio(a: str, b: str) -> float:
                    return 100.0 if a == b else 0.0

    parsed     = parse_mis_id_cell(mis_id_cell)
    all_tagged = parsed.get('all_tagged', [])
    result: Dict[str, List] = {brand: [] for brand in brands}
    unmatched: list = []

    for tag, mid in all_tagged:
        csv_brand = get_brand_from_mis_id(mid, mis_df)
        if csv_brand:
            csv_lower = csv_brand.lower().strip()
            matched   = False
            # Pass 1: exact match
            for brand in brands:
                if csv_lower == brand.lower().strip():
                    result[brand].append((tag, mid)); matched = True; break
            # Pass 2: high-confidence fuzzy (avoids substring confusion)
            if not matched:
                for brand in brands:
                    bl = brand.lower().strip()
                    if (bl in csv_lower and bl != csv_lower) or (csv_lower in bl and bl != csv_lower):
                        continue
                    if _fuzz.token_set_ratio(csv_lower, bl) >= 95:
                        result[brand].append((tag, mid)); matched = True; break
            if not matched:
                unmatched.append((tag, mid, csv_brand))
        else:
            unmatched.append((tag, mid, None))

    if unmatched:
        result['_unmatched'] = unmatched
    return result


# ── Monolith: line 32817 ──────────────────────────────────────────────────────

def format_brand_mis_ids(tagged_ids: List[tuple]) -> str:
    """
    Format [(tag, id), ...] tuples back into a cell string.
    e.g. [('W1','12345'),('W2','67890')] → 'W1: 12345, W2: 67890'
    Monolith: line 32817.
    """
    if not tagged_ids:
        return ''
    return ', '.join(f"{tag}: {mid}" for tag, mid in tagged_ids)


# ── Monolith: line 32827 ──────────────────────────────────────────────────────

def format_tagged_mis_cell(
    section: str, parts: List[str] | None = None,
    patch: str | None = None, existing_content: str | None = None,
) -> str:
    """
    Format MIS IDs into tagged newline-separated cell format.
    v10.8: W1/W2/WP, M1/M2/MP, S1/S2/SP.
    Monolith: line 32827.
    """
    s = (section or 'weekly').lower()
    prefix = 'W' if s.startswith('week') or s == 'w' else \
             'M' if s.startswith('month') or s == 'm' else \
             'S' if s.startswith('sale') or s == 's' else 'W'

    existing = parse_mis_id_cell(existing_content) if existing_content else None
    lines: list = []

    if existing and existing['raw']:
        for line in existing['raw'].replace('\r\n', '\n').split('\n'):
            line = line.strip()
            if line and line[0].upper() != prefix:
                lines.append(line)

    if parts:
        for i, pid in enumerate(parts, 1):
            if pid:
                lines.append(f"{prefix}{i}: {pid}")
    if patch:
        lines.append(f"{prefix}P: {patch}")

    return '\n'.join(lines)
