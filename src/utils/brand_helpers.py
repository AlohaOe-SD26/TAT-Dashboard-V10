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
