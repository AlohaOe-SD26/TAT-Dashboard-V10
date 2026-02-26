# src/utils/sheet_helpers.py
# ─────────────────────────────────────────────────────────────────────────────
# Google Sheet parsing helpers.
# Extracted from monolith (main_-_bloat.py) lines 4709, 25669, 32843, 32953.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
from typing import Any, Dict, List

import pandas as pd


def detect_header_row(sheet_data: List[List[str]]) -> int:
    """
    Detect the header row index by scanning for key column names.
    Scans first 10 rows for keywords like 'Brand', 'Deal', 'Discount'.
    Returns the index of the first row with 3+ keyword matches, else 0.
    Monolith: line 4709.
    """
    key_columns = ['Brand', 'Weekday', 'Deal', 'Discount', 'Location']
    for row_idx, row in enumerate(sheet_data[:10]):
        row_str = ' '.join([str(cell).strip() for cell in row]).lower()
        matches = sum(1 for keyword in key_columns if keyword.lower() in row_str)
        if matches >= 3:
            return row_idx
    return 0


def get_col_letter(n: int) -> str:
    """
    Convert a zero-based column index to a spreadsheet column letter.
    e.g. 0 → 'A', 25 → 'Z', 26 → 'AA'.
    Monolith: line 25669.
    """
    string = ""
    while n >= 0:
        string = chr((n % 26) + 65) + string
        n = (n // 26) - 1
    return string


def update_tagged_mis_cell(
    existing_content: str,
    tag: str,
    new_id: str,
    append_mode: bool = False,
) -> str:
    """
    Update a specific tag in a MIS ID cell, preserving other tag lines.

    Tags: 'w1', 'w2', 'wp', 'm1', 'm2', 'mp', 's1', 's2', 'sp'
    (legacy tags 'part1', 'part2', 'gap', 'patch' also supported).

    append_mode=True: always append a new line even if tag already exists.
    append_mode=False: replace existing matching tag line.
    Monolith: line 32843.
    """
    if not new_id or not str(new_id).strip():
        return existing_content

    new_id = str(new_id).strip()
    tag_lower = tag.lower().strip()
    new_id = strip_mis_id_tag(new_id)

    existing_lines: list[str] = []
    if existing_content:
        existing_lines = [
            l.strip()
            for l in existing_content.replace('\r\n', '\n').split('\n')
            if l.strip()
        ]

    TAG_MAP: dict[str, tuple[str, str]] = {
        'w1': ('W1', 'w1'), 'weekly1': ('W1', 'w1'), 'weekly_1': ('W1', 'w1'),
        'w2': ('W2', 'w2'), 'weekly2': ('W2', 'w2'), 'weekly_2': ('W2', 'w2'),
        'w3': ('W3', 'w3'), 'weekly3': ('W3', 'w3'), 'weekly_3': ('W3', 'w3'),
        'wp': ('WP', 'wp'), 'weekly_patch': ('WP', 'wp'), 'weeklypatch': ('WP', 'wp'),
        'm1': ('M1', 'm1'), 'monthly1': ('M1', 'm1'), 'monthly_1': ('M1', 'm1'),
        'm2': ('M2', 'm2'), 'monthly2': ('M2', 'm2'), 'monthly_2': ('M2', 'm2'),
        'm3': ('M3', 'm3'), 'monthly3': ('M3', 'm3'), 'monthly_3': ('M3', 'm3'),
        'mp': ('MP', 'mp'), 'monthly_patch': ('MP', 'mp'), 'monthlypatch': ('MP', 'mp'),
        's1': ('S1', 's1'), 'sale1': ('S1', 's1'), 'sale_1': ('S1', 's1'),
        's2': ('S2', 's2'), 'sale2': ('S2', 's2'), 'sale_2': ('S2', 's2'),
        's3': ('S3', 's3'), 'sale3': ('S3', 's3'), 'sale_3': ('S3', 's3'),
        'sp': ('SP', 'sp'), 'sale_patch': ('SP', 'sp'), 'salepatch': ('SP', 'sp'),
        # legacy
        'part1': ('W1', 'w1'), 'part_1': ('W1', 'w1'), 'part 1': ('W1', 'w1'),
        'part2': ('W2', 'w2'), 'part_2': ('W2', 'w2'), 'part 2': ('W2', 'w2'),
        'gap':   ('M1', 'm1'),
        'patch': ('WP', 'wp'),
    }

    prefix_label, tag_prefix = TAG_MAP.get(tag_lower, ('W1', 'w1'))
    new_line = f"{prefix_label}: {new_id}"

    found = False
    result_lines: list[str] = []
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


def strip_mis_id_tag(tagged_id: str) -> str:
    """
    Strip any tag prefix from a MIS ID for display or lookup.

    Examples:
        'W1: 12345' -> '12345'
        'WP: 67890' -> '67890'
        '12345'     -> '12345'

    Monolith: line 32953.
    """
    if not tagged_id:
        return ''
    tagged_id = str(tagged_id).strip()
    if ':' in tagged_id:
        return tagged_id.split(':', 1)[1].strip()
    return tagged_id


def format_csv_categories(cat_raw: str, exc_raw: str) -> str:
    """
    Format category + exception fields for CSV output.

    If 'All Categories' detected:
      - Returns 'All Categories' or 'All Categories (Except: X)' for UI.
      - CSV generator handles blanking this for the actual file.
    Otherwise returns a cleaned comma-separated category string.
    Monolith: line 6181.
    """
    cat_str = str(cat_raw).strip()
    exc_str = str(exc_raw).strip()

    if 'all categories' in cat_str.lower():
        if exc_str and exc_str.lower() not in ['nan', 'none', '']:
            return f"All Categories (Except: {exc_str})"
        return "All Categories"

    if not cat_str or cat_str.lower() in ['nan', 'none']:
        return ""

    return ", ".join([c.strip() for c in cat_str.split(',') if c.strip()])


def parse_percentage(value: Any) -> float:
    """
    Parse a percentage value from a cell (e.g. '50%', '50', 50) → 50.0.
    Returns 0.0 on any parse failure.
    Monolith: line 5106.
    """
    if pd.isna(value):
        return 0.0
    val_str = str(value).strip().replace('%', '').replace(',', '')
    try:
        return float(val_str)
    except Exception:
        return 0.0


def get_col(row: pd.Series, possible_names: List[str], default: Any = '') -> Any:
    """
    Flexible column accessor with bracket-header alias resolution.

    Resolution order for each name in possible_names:
      1. bracket_map: '[Weekday]' → 'Weekday [Weekday]'  (from session)
      2. Exact match in row.index
      3. prefix_map:  'Weekday' → 'Weekday [Weekday]'   (from session)

    Falls through to next name if current name doesn't resolve.
    Monolith: line 4849 (adapted: GLOBAL_DATA → session).
    """
    # Lazy import to avoid circular dependency at module load time
    try:
        from src.session import session as _session
        bracket_map: dict = _session.get_mis_bracket_map() or {}
        prefix_map: dict = _session.get_mis_prefix_map() or {}
    except Exception:
        bracket_map = {}
        prefix_map = {}

    for name in possible_names:
        # 1. Bracket alias
        resolved = bracket_map.get(name)
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
        resolved_prefix = prefix_map.get(name)
        if resolved_prefix and resolved_prefix in row.index:
            val = row[resolved_prefix]
            if isinstance(val, pd.Series):
                val = val.iloc[0]
            if pd.notna(val):
                return val

    return default


def parse_mis_id_cell(cell_value: str, section: str | None = None) -> Dict[str, Any]:
    """
    Parse a Google Sheet MIS ID cell that may contain tagged IDs.

    v10.8 format (newline-separated, section-based tags):
        W1: 12345  (Weekly Original)   WP: 67890  (Weekly Patch)
        M1: 99999  (Monthly Original)  MP: 88888  (Monthly Patch)
        S1: 66666  (Sale Original)     SP: 55555  (Sale Patch)

    Returns dict with keys:
        'weekly', 'monthly', 'sale' → {'parts': [...], 'patch': str|None}
        'parts', 'patches', 'gaps'  → combined lists (backward compat)
        'raw', 'is_tagged', 'all_tagged', 'part1'
    Monolith: line 32399.
    """
    result: Dict[str, Any] = {
        'weekly':  {'parts': [], 'patch': None},
        'monthly': {'parts': [], 'patch': None},
        'sale':    {'parts': [], 'patch': None},
        'parts':   [],
        'patches': [],
        'gaps':    [],
        'raw':       str(cell_value).strip() if cell_value else '',
        'is_tagged': False,
        'all_tagged': [],
    }

    if not cell_value or str(cell_value).strip() in ['', 'nan', 'None', '-']:
        print(f"[PARSE] Empty or invalid cell value: '{cell_value}'")
        return result

    raw = str(cell_value).strip()
    print(f"[PARSE] Raw input: '{raw}'")

    # Capture all tagged IDs in order (multi-brand support)
    for m in re.finditer(r'([WwMmSs])([1-9Pp])\s*:\s*(\d+)', raw):
        result['all_tagged'].append((f"{m.group(1).upper()}{m.group(2).upper()}", m.group(3)))

    def _fill_parts(pattern: str, section_key: str) -> None:
        for m in re.finditer(pattern, raw):
            part_num = int(m.group(1))
            mis_id   = m.group(2)
            print(f"[PARSE] Found {section_key[0].upper()}{part_num}: {mis_id}")
            lst = result[section_key]['parts']
            while len(lst) < part_num:
                lst.append(None)
            lst[part_num - 1] = mis_id
            if mis_id not in result['parts']:
                result['parts'].append(mis_id)
            result['is_tagged'] = True

    _fill_parts(r'[Ww](\d+)\s*:\s*(\d+)', 'weekly')
    _fill_parts(r'[Mm](\d+)\s*:\s*(\d+)', 'monthly')
    _fill_parts(r'[Ss](\d+)\s*:\s*(\d+)', 'sale')

    for sec_letter, sec_key in (('w', 'weekly'), ('m', 'monthly'), ('s', 'sale')):
        m = re.search(rf'[{sec_letter}{sec_letter.upper()}][Pp]\s*:\s*(\d+)', raw)
        if m:
            mis_id = m.group(1)
            print(f"[PARSE] Found {sec_letter.upper()}P: {mis_id}")
            result[sec_key]['patch'] = mis_id
            result['patches'].append(mis_id)
            result['is_tagged'] = True

    # Legacy: Part 1, Part 2 → weekly
    for m in re.finditer(r'[Pp]art\s*(\d+)\s*:\s*(\d+)', raw):
        part_num, mis_id = int(m.group(1)), m.group(2)
        print(f"[PARSE] Found legacy Part {part_num}: {mis_id}")
        lst = result['weekly']['parts']
        while len(lst) < part_num:
            lst.append(None)
        if lst[part_num - 1] is None:
            lst[part_num - 1] = mis_id
        if mis_id not in result['parts']:
            result['parts'].append(mis_id)
        result['is_tagged'] = True

    # Legacy: GAP
    for m in re.finditer(r'[Gg][Aa][Pp]\s*:\s*(\d+)', raw):
        print(f"[PARSE] Found legacy GAP: {m.group(1)}")
        result['gaps'].append(m.group(1))
        result['is_tagged'] = True

    # Legacy: Patch (no section prefix)
    m = re.search(r'[Pp]atch\s*:\s*(\d+)', raw)
    if m:
        mis_id = m.group(1)
        print(f"[PARSE] Found legacy Patch: {mis_id}")
        if result['weekly']['patch'] is None:
            result['weekly']['patch'] = mis_id
        if mis_id not in result['patches']:
            result['patches'].append(mis_id)
        result['is_tagged'] = True

    # Untagged plain numeric ID
    if not result['is_tagged']:
        m = re.match(r'^(\d{5,7})$', raw)
        if m:
            mis_id = m.group(1)
            print(f"[PARSE] Found plain ID: {mis_id}")
            result['weekly']['parts'].append(mis_id)
            result['parts'].append(mis_id)

    # Strip None placeholders
    for sec in ('weekly', 'monthly', 'sale'):
        result[sec]['parts'] = [p for p in result[sec]['parts'] if p is not None]

    result['part1'] = result['parts'][0] if result['parts'] else None
    print(f"[PARSE] Result: weekly={result['weekly']}, monthly={result['monthly']}, sale={result['sale']}")
    return result
