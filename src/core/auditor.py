# src/core/auditor.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# MAudit engine. ONE audit engine — legacy audit_google_vs_mis() is dead code.
# Bidirectional: Sheet→MIS (missing/wrong entries) AND MIS→Sheet (zombies).
# No Flask, no Selenium — pure data logic.
#
# Entry points:
#   run_maudit(google_df, mis_df, section_type)            → AuditResultGroup
#   run_conflict_audit_mis_vs_sheet(mis_df, google_df)     → list[dict]
#   run_conflict_audit_sheet_vs_mis(sections_data, ...)    → list[dict]  (→ gsheet-conflict-audit)
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Literal, Tuple

import pandas as pd
try:
    from rapidfuzz import fuzz  # type: ignore
except ImportError:
    try:
        from fuzzywuzzy import fuzz  # type: ignore
    except ImportError:
        import difflib
        class fuzz:  # type: ignore
            @staticmethod
            def token_set_ratio(a: str, b: str) -> int:
                return int(difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio() * 100)
            partial_ratio = token_set_ratio

from src.utils.location_helpers import (
    normalize_location_string,
    format_location_display,
    resolve_location_columns,
)
from src.utils.sheet_helpers import get_col, parse_percentage, parse_mis_id_cell


AuditResultGroup = Dict[str, List[dict]]
"""
Standard audit result structure:
{
    'verified':    [...],  # Fields match
    'mismatches':  [...],  # Fields differ
    'not_found':   [...],  # In Sheet but not found in MIS
    'missing_id':  [...],  # In Sheet but no MIS ID recorded
}
"""


# ── Internal helpers ──────────────────────────────────────────────────────────

def _parse_dt(d_str: str) -> datetime | None:
    """Parse flexible date formats to datetime. Returns None on failure."""
    if not d_str or str(d_str).lower() in ('nan', 'none', '', '-'):
        return None
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m-%d-%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(str(d_str).strip(), fmt)
        except ValueError:
            continue
    return None


def _norm_num(val: Any) -> float | None:
    """Normalize a value to float. None if unparseable."""
    if val is None:
        return None
    s = str(val).strip().lower()
    if not s or s in ('nan', 'none', '', '-', 'n/a'):
        return None
    had_pct = '%' in s
    s = re.sub(r'[^0-9.\-]', '', s)
    if not s or s == '-':
        return None
    try:
        n = float(s)
        if 0 < n < 1 and not had_pct:
            n *= 100
        return n
    except ValueError:
        return None


# ── MAudit: Sheet → MIS ───────────────────────────────────────────────────────

def run_maudit(
    google_df: pd.DataFrame,
    mis_df: pd.DataFrame,
    section_type: Literal['weekly', 'monthly', 'sale'] = 'weekly',
    bracket_map: dict | None = None,
    prefix_map: dict | None = None,
) -> AuditResultGroup:
    """
    MAudit: Verify Google Sheet deals against MIS CSV data.
    Migrated from monolith api_mis_maudit() (~line 26044).

    Compares: Discount, Vendor %, Start/End Dates, Brand, Locations.
    Groups results by verification status.

    Direction: Sheet → MIS (Source → Target).
    Finds: Deals in Sheet that are missing or wrong in MIS.
    """
    bmap = bracket_map or {}
    pmap = prefix_map or {}

    results: AuditResultGroup = {
        'verified': [],
        'mismatches': [],
        'not_found': [],
        'missing_id': [],
    }

    # Detect ID column in MIS CSV
    id_col: str | None = None
    for candidate in ['ID', 'id', 'MIS ID', 'Mis Id']:
        if candidate in mis_df.columns:
            id_col = candidate
            break
    if not id_col:
        raise ValueError("Cannot find ID column in MIS CSV")

    for idx, row in google_df.iterrows():
        true_row = int(row.get('_SHEET_ROW_NUM', idx + 2))

        brand = str(get_col(row, ['[Brand]', 'Brand'], '', bmap, pmap)).strip()
        if not brand or brand in ('nan', 'None', '-', ''):
            continue

        mis_id_cell = str(row.get('MIS ID', '')).strip()
        discount_raw  = str(get_col(row, ['[Daily Deal Discount]', 'Deal Discount Value/Type',
                                          'Deal Discount', 'Discount'], '', bmap, pmap)).strip()
        vendor_raw    = str(get_col(row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)',
                                          'Vendor Contribution', 'Vendor %'], '', bmap, pmap)).strip()
        loc_raw, exc_raw = resolve_location_columns(row)
        locations     = format_location_display(loc_raw, exc_raw) if loc_raw else 'All Locations'
        weekday       = str(get_col(row, ['[Weekday]', 'Weekday', 'Day of Week'], '', bmap, pmap)).strip()
        start_date    = str(row.get('Start Date', '')).strip()
        end_date      = str(row.get('End Date', '')).strip()

        base_entry = {
            'row': true_row,
            'section': section_type,
            'brand': brand,
            'weekday': weekday,
            'start_date': start_date,
            'discount': discount_raw,
            'locations': locations,
        }

        # ── Missing MIS ID ────────────────────────────────────────────────────
        if not mis_id_cell or mis_id_cell in ('nan', 'None', '-', ''):
            results['missing_id'].append(base_entry)
            continue

        # ── Parse MIS ID cell → extract first usable numeric ID ──────────────
        parsed = parse_mis_id_cell(mis_id_cell, section_type)
        first_mis_id: str | None = None

        if parsed.get(section_type) and parsed[section_type].get('parts'):
            first_mis_id = parsed[section_type]['parts'][0]
        elif parsed.get('parts'):
            first_mis_id = parsed['parts'][0] if parsed['parts'] else None

        if not first_mis_id:
            ids = re.findall(r'\d{5,7}', mis_id_cell)
            if ids:
                first_mis_id = ids[0]

        if not first_mis_id:
            results['missing_id'].append({**base_entry, 'note': 'Could not parse MIS ID'})
            continue

        # ── Look up in MIS CSV ────────────────────────────────────────────────
        csv_matches = mis_df[mis_df[id_col].astype(str).str.strip() == str(first_mis_id).strip()]

        if csv_matches.empty:
            results['not_found'].append({**base_entry, 'mis_id': first_mis_id})
            continue

        # ── Field comparison ──────────────────────────────────────────────────
        csv_row   = csv_matches.iloc[0]
        issues: List[str] = []

        exp_disc  = _norm_num(discount_raw)
        act_disc  = _norm_num(csv_row.get('Daily Deal Discount', ''))
        if exp_disc is not None and act_disc is not None:
            if abs(exp_disc - act_disc) > 0.5:
                issues.append(f"Discount: expected '{discount_raw}', got '{csv_row.get('Daily Deal Discount')}'")

        exp_vend  = _norm_num(vendor_raw)
        act_vend  = _norm_num(csv_row.get('Discount paid by vendor', ''))
        if exp_vend is not None and act_vend is not None:
            if abs(exp_vend - act_vend) > 0.5:
                issues.append(f"Vendor%: expected '{vendor_raw}', got '{csv_row.get('Discount paid by vendor')}'")

        # Locations: normalize both and compare
        exp_locs  = normalize_location_string(locations)
        act_locs  = normalize_location_string(str(csv_row.get('Store', '')))
        if exp_locs.lower() != act_locs.lower():
            issues.append(f"Locations: expected '{locations}', got '{csv_row.get('Store')}'")

        full_entry = {
            **base_entry,
            'mis_id': first_mis_id,
            'issues': issues,
            'mis_data': {
                'id': first_mis_id,
                'brand': str(csv_row.get('Brand', '')),
                'discount': str(csv_row.get('Daily Deal Discount', '')),
                'vendor_pct': str(csv_row.get('Discount paid by vendor', '')),
                'locations': str(csv_row.get('Store', '')),
                'start_date': str(csv_row.get('Start date', '')),
                'end_date': str(csv_row.get('End date', '')),
            },
        }

        if issues:
            results['mismatches'].append(full_entry)
        else:
            results['verified'].append(full_entry)

    return results


# ── Conflict Audit: MIS → Sheet (Zombie detection) ────────────────────────────

def run_conflict_audit_mis_vs_sheet(
    mis_df: pd.DataFrame,
    google_df: pd.DataFrame | None = None,  # reserved for future cross-reference
) -> list[dict]:
    """
    Conflict Audit — Direction: MIS → Sheet.
    Finds active MIS entries that have conflicting (Brand, Weekday) fingerprints.
    These are Zombie candidates — active deals that may have been superseded.

    Migrated from monolith api_mis_conflict_audit() (~line 33587).

    Fingerprint: Brand + Weekday (location-independent, catches all schedule collisions).
    Returns list of conflict groups with > 1 active entry per fingerprint.
    """
    if mis_df is None or mis_df.empty:
        return []

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    active_rows: list[pd.Series] = []

    for _, row in mis_df.iterrows():
        start_str = str(row.get('Start date', '')).strip()
        end_str   = str(row.get('End date', '')).strip()
        try:
            s_date = _parse_dt(start_str)
            e_date = _parse_dt(end_str)
            is_started   = s_date is None or s_date <= today
            is_not_ended = e_date is None or e_date >= today
            if is_started and is_not_ended:
                active_rows.append(row)
        except Exception:
            continue

    if not active_rows:
        return []

    grouped: dict[str, list[dict]] = {}
    for row in active_rows:
        brand   = str(row.get('Brand', 'N/A')).strip()
        weekday = str(row.get('Weekday', 'All')).strip()
        fingerprint = f"{brand}|{weekday}".lower()
        if fingerprint not in grouped:
            grouped[fingerprint] = []
        grouped[fingerprint].append({
            'mis_id':    str(row.get('ID', '')),
            'brand':     brand,
            'category':  str(row.get('Category', 'N/A')).strip(),
            'discount':  str(row.get('Daily Deal Discount', '0')).strip(),
            'weekday':   weekday,
            'locations': normalize_location_string(str(row.get('Store', 'All Locations'))),
            'start':     str(row.get('Start date', '')),
            'end':       str(row.get('End date', '')),
        })

    conflicts: list[dict] = []
    for key, rows in grouped.items():
        if len(rows) <= 1:
            continue
        first = rows[0]
        discounts_found = list({r['discount'] for r in rows})
        disc_summary = ' vs '.join(discounts_found)
        if len(disc_summary) > 50:
            disc_summary = disc_summary[:47] + '...'
        conflicts.append({
            'fingerprint': key,
            'title':  f"{first['brand']} ({first['weekday']}) - [{disc_summary}]",
            'count':  len(rows),
            'rows':   rows,
        })

    conflicts.sort(key=lambda x: x['count'], reverse=True)
    return conflicts


# ── Conflict Audit: Sheet → MIS (cross-section brand date conflicts) ──────────

def run_conflict_audit_sheet_vs_mis(
    sections_data: dict[str, pd.DataFrame],
    target_month: int,
    target_year: int,
    bracket_map: dict | None = None,
    prefix_map: dict | None = None,
) -> dict[str, Any]:
    """
    Date-aware pre-flight check: Scans Google Sheet for cross-section brand conflicts.
    Returns TWO sets of conflicts:
        1. date_conflicts:  Same Brand + Same Date overlap.
        2. brand_conflicts: Same Brand in multiple sections (regardless of date).

    Migrated from monolith api_gsheet_conflict_audit() (~line 31377).

    This is a pure-data function. Callers provide sections_data from
    fetch_google_sheet_data(), which is already in SessionManager.
    """
    from src.utils.date_helpers import (
        expand_weekday_to_dates,
        parse_monthly_dates,
        parse_sale_dates,
        get_monthly_day_of_month,
        get_all_weekdays_for_multiday_group,
    )
    from src.core.matcher import detect_multi_day_groups

    bmap = bracket_map or {}
    pmap = prefix_map or {}

    brand_date_map:    dict[tuple, list] = {}   # (brand, date) → list[entry]
    brand_general_map: dict[str, list]   = {}   # brand → list[entry]

    section_counts = {'weekly': 0, 'monthly': 0, 'sale': 0}
    unique_brands:  set[str] = set()

    for section_key in ('weekly', 'monthly', 'sale'):
        section_df = sections_data.get(section_key, pd.DataFrame())
        if section_df.empty:
            continue

        multi_day_groups, row_to_group = detect_multi_day_groups(section_df, section_key, bmap, pmap)
        processed_groups: set[str] = set()

        for idx, row in section_df.iterrows():
            brand = str(get_col(row, ['[Brand]', 'Brand'], '', bmap, pmap)).strip()
            if not brand:
                continue

            unique_brands.add(brand)
            true_row  = int(row.get('_SHEET_ROW_NUM', idx + 2))
            group_id  = row_to_group.get(true_row)

            # Weekday/date raw
            if section_key == 'weekly':
                weekday_raw = str(get_col(row, ['[Weekday]', 'Weekday', 'Day of Week'], '-', bmap, pmap)).strip()
            elif section_key == 'monthly':
                weekday_raw = get_monthly_day_of_month(row) or '-'
            else:
                weekday_raw = str(get_col(row, ['[Weekday]', 'Sale Runs:', 'Contracted Duration',
                                                 'Weekday/ Day of Month', 'Day of Week', 'Weekday'], '-', bmap, pmap)).strip()

            discount    = str(get_col(row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], '-', bmap, pmap)).strip()
            vendor      = str(get_col(row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], '-', bmap, pmap)).strip()
            mis_id      = str(get_col(row, ['MIS ID', 'ID'], '', bmap, pmap)).strip()
            special_notes = str(row.get('SPECIAL NOTES', '')).strip()
            loc_raw, exc_raw = resolve_location_columns(row)
            locations   = format_location_display(loc_raw, exc_raw)

            # Expanded dates
            expanded_dates: list = []
            is_multi_day_parent = False

            if section_key == 'weekly':
                if group_id and group_id in multi_day_groups:
                    if group_id in processed_groups:
                        continue
                    processed_groups.add(group_id)
                    is_multi_day_parent = True
                    expanded_dates = get_all_weekdays_for_multiday_group(
                        multi_day_groups[group_id], section_df, section_key, target_month, target_year
                    )
                    weekday_raw = ', '.join(multi_day_groups[group_id].get('weekdays', []))
                else:
                    expanded_dates = expand_weekday_to_dates(weekday_raw, target_month, target_year)
            elif section_key == 'monthly':
                expanded_dates = parse_monthly_dates(weekday_raw, target_month, target_year)
            else:  # sale
                expanded_dates = parse_sale_dates(weekday_raw, target_month, target_year)

            section_counts[section_key] += 1

            entry = {
                'brand': brand,
                'section': section_key,
                'google_row': true_row,
                'weekday': weekday_raw,
                'discount': discount,
                'vendor': vendor,
                'mis_id': mis_id,
                'locations': locations,
                'special_notes': special_notes,
                'expanded_dates': expanded_dates,
                'is_multi_day': is_multi_day_parent,
            }

            # Brand general map (cross-section presence)
            brand_key = brand.lower().strip()
            if brand_key not in brand_general_map:
                brand_general_map[brand_key] = []
            brand_general_map[brand_key].append(entry)

            # Brand + date map
            for d in expanded_dates:
                key = (brand_key, d)
                if key not in brand_date_map:
                    brand_date_map[key] = []
                brand_date_map[key].append(entry)

    # ── Date Conflicts ────────────────────────────────────────────────────────
    date_conflicts: list[dict] = []
    seen_date_keys: set = set()

    for (brand_key, date_obj), entries in brand_date_map.items():
        if len(entries) <= 1:
            continue
        conflict_key = (brand_key, str(date_obj))
        if conflict_key in seen_date_keys:
            continue
        seen_date_keys.add(conflict_key)
        sections_involved = {e['section'] for e in entries}
        date_conflicts.append({
            'brand':    entries[0]['brand'],
            'date':     date_obj.strftime('%Y-%m-%d') if hasattr(date_obj, 'strftime') else str(date_obj),
            'sections': sorted(sections_involved),
            'count':    len(entries),
            'entries':  entries,
        })

    date_conflicts.sort(key=lambda x: (x['brand'], x['date']))

    # ── Brand Conflicts (same brand, multiple sections, any date) ─────────────
    brand_conflicts: list[dict] = []
    for brand_key, entries in brand_general_map.items():
        sections_involved = {e['section'] for e in entries}
        if len(sections_involved) > 1:
            brand_conflicts.append({
                'brand':    entries[0]['brand'],
                'sections': sorted(sections_involved),
                'count':    len(entries),
                'entries':  entries,
            })

    brand_conflicts.sort(key=lambda x: x['brand'])

    return {
        'date_conflicts':  date_conflicts,
        'brand_conflicts': brand_conflicts,
        'section_counts':  section_counts,
        'unique_brands':   len(unique_brands),
        'total_date_conflicts':  len(date_conflicts),
        'total_brand_conflicts': len(brand_conflicts),
    }
