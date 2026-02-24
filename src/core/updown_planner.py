# src/core/updown_planner.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# Up-Down Planning engine.  4-step slicing scenario.
# Tier 1 (Sale/Monthly) DOMINANT — never modified.
# Tier 2 (Weekly)       SUBSERVIENT — splits around Tier 1.
# No Flask, no Selenium — pure data logic.
#
# Entry points:
#   build_split_plan(sections_data, target_month, target_year)   → plan dict
#   verify_gap_closure(plan, mis_df)                              → gap dict
#   build_final_entry_payload(plan_row)                           → payload dict
#   verify_final_entry(plan_row, mis_df)                          → verify dict
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

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

from src.utils.date_helpers import (
    expand_weekday_to_dates,
    parse_monthly_dates,
    parse_sale_dates,
    get_monthly_day_of_month,
    get_all_weekdays_for_multiday_group,
)
from src.utils.location_helpers import (
    format_location_display,
    format_location_set,
    resolve_location_columns,
    calculate_location_conflict,
)
from src.utils.sheet_helpers import get_col, parse_mis_id_cell
from src.core.matcher import detect_multi_day_groups


# ── Private helpers ───────────────────────────────────────────────────────────

def _parse_dt(d_str: str) -> datetime | None:
    """Parse flexible date formats. Returns None on failure."""
    if not d_str or str(d_str).lower() in ('nan', 'none', '', '-'):
        return None
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m-%d-%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(str(d_str).strip(), fmt)
        except ValueError:
            continue
    return None


def _check_mis_weekday_active(check_date: date, mis_weekdays: str) -> bool:
    """Return True if check_date falls on a day covered by mis_weekdays string."""
    day_name = check_date.strftime('%A').lower()
    wk_lower = mis_weekdays.lower()
    if not wk_lower or wk_lower in ('all', 'all days', ''):
        return True
    # Monday through Sunday partial match
    day_abbrs = {
        'monday': ['monday', 'mon'],
        'tuesday': ['tuesday', 'tue'],
        'wednesday': ['wednesday', 'wed'],
        'thursday': ['thursday', 'thu'],
        'friday': ['friday', 'fri'],
        'saturday': ['saturday', 'sat'],
        'sunday': ['sunday', 'sun'],
    }
    for abbr in day_abbrs.get(day_name, [day_name]):
        if abbr in wk_lower:
            return True
    return False


def _generate_split_plan(
    weekly: dict,
    conflict_dates: list[date],
    conflict_type: str = 'FULL',
    non_conflict_stores: set | None = None,
) -> list[dict]:
    """
    Generate MIS entry plan for splitting a Weekly deal around conflict dates.
    Returns list of action dicts: CREATE_PART1, GAP, PATCH, CREATE_PART2.
    """
    weekly_dates = sorted(weekly.get('expanded_dates', []))
    if not weekly_dates or not conflict_dates:
        return []

    plan: list[dict] = []
    conflict_set = set(conflict_dates)

    part1_dates = [d for d in weekly_dates if d < min(conflict_dates)]
    if part1_dates:
        plan.append({
            'action': 'CREATE_PART1',
            'dates': f"{part1_dates[0].strftime('%m/%d')} - {part1_dates[-1].strftime('%m/%d')}",
            'start_date': part1_dates[0].strftime('%m/%d/%Y'),
            'end_date': (min(conflict_dates) - timedelta(days=1)).strftime('%m/%d/%Y'),
            'notes': f"End date: {(min(conflict_dates) - timedelta(days=1)).strftime('%m/%d')}",
        })

    plan.append({
        'action': 'GAP',
        'dates': ', '.join(d.strftime('%m/%d') for d in sorted(conflict_dates)),
        'notes': 'Tier 1 deal active — Weekly pauses at conflicting locations',
    })

    if conflict_type == 'PARTIAL' and non_conflict_stores:
        patch_locs = format_location_set(non_conflict_stores, weekly.get('locations', ''))
        plan.append({
            'action': 'PATCH',
            'dates': ', '.join(d.strftime('%m/%d') for d in sorted(conflict_dates)),
            'start_date': min(conflict_dates).strftime('%m/%d/%Y'),
            'end_date': max(conflict_dates).strftime('%m/%d/%Y'),
            'notes': f"Weekly continues at: {patch_locs}",
            'locations': patch_locs,
            'discount': weekly.get('discount'),
            'vendor_contrib': weekly.get('vendor_contrib'),
        })

    part2_dates = [d for d in weekly_dates if d > max(conflict_dates)]
    if part2_dates:
        plan.append({
            'action': 'CREATE_PART2',
            'dates': f"{part2_dates[0].strftime('%m/%d')} - {part2_dates[-1].strftime('%m/%d')}",
            'start_date': part2_dates[0].strftime('%m/%d/%Y'),
            'end_date': part2_dates[-1].strftime('%m/%d/%Y'),
            'notes': f"Start date: {(max(conflict_dates) + timedelta(days=1)).strftime('%m/%d')} (New MIS ID required)",
        })

    return plan


def detect_split_requirements(
    weekly_deals: list[dict],
    tier1_deals:  list[dict],
    target_month: int,
    target_year:  int,
) -> tuple[list[dict], list[dict]]:
    """
    Identify Weekly deals that conflict with Tier 1 deals and require splitting.
    Returns: (splits_required, no_conflict)
    """
    splits_required: list[dict] = []
    no_conflict: list[dict] = []

    # Build Tier 1 date map: {(brand_lower, date) → [deal_info]}
    tier1_date_map: dict[tuple, list] = {}
    for deal in tier1_deals:
        brand_lower = deal.get('brand', '').lower()
        for d in deal.get('expanded_dates', []):
            key = (brand_lower, d)
            if key not in tier1_date_map:
                tier1_date_map[key] = []
            tier1_date_map[key].append(deal)

    for weekly in weekly_deals:
        brand_lower   = weekly.get('brand', '').lower()
        weekly_dates  = weekly.get('expanded_dates', [])
        conflict_dates: list[date] = []
        interrupting:   list[dict] = []

        for d in weekly_dates:
            key = (brand_lower, d)
            if key in tier1_date_map:
                conflict_dates.append(d)
                interrupting.extend(tier1_date_map[key])

        if not conflict_dates:
            no_conflict.append({
                'brand':         weekly.get('brand'),
                'weekday':       weekly.get('weekday'),
                'section':       'Weekly',
                'discount':      weekly.get('discount'),
                'vendor_contrib': weekly.get('vendor_contrib'),
                'locations':     weekly.get('locations'),
                'google_row':    weekly.get('google_row'),
                'mis_id':        weekly.get('mis_id'),
                'deal_info':     weekly.get('deal_info', ''),
                'special_notes': weekly.get('special_notes', ''),
                'categories':    weekly.get('categories', ''),
            })
            continue

        # Location-aware conflict detection
        tier1_locs = interrupting[0].get('locations', '') if interrupting else ''
        has_conflict, conflict_stores, non_conflict_stores, conflict_type = calculate_location_conflict(
            weekly.get('locations', ''), tier1_locs
        )

        if not has_conflict or conflict_type == 'NONE':
            no_conflict.append({
                'brand':         weekly.get('brand'),
                'weekday':       weekly.get('weekday'),
                'section':       'Weekly',
                'discount':      weekly.get('discount'),
                'vendor_contrib': weekly.get('vendor_contrib'),
                'locations':     weekly.get('locations'),
                'google_row':    weekly.get('google_row'),
                'mis_id':        weekly.get('mis_id'),
            })
            continue

        conflict_dates_sorted = sorted(set(conflict_dates))
        plan = _generate_split_plan(weekly, conflict_dates_sorted, conflict_type, non_conflict_stores)

        splits_required.append({
            'brand':               weekly.get('brand'),
            'weekday':             weekly.get('weekday'),
            'section':             'weekly',
            'original_mis_id':    weekly.get('mis_id'),
            'parsed_mis_ids':     parse_mis_id_cell(weekly.get('mis_id', '')),
            'discount':           weekly.get('discount'),
            'vendor_contrib':     weekly.get('vendor_contrib'),
            'locations':          weekly.get('locations'),
            'google_row':         weekly.get('google_row'),
            'deal_info':          weekly.get('deal_info', ''),
            'special_notes':      weekly.get('special_notes', ''),
            'categories':         weekly.get('categories', ''),
            'linked_brand':       weekly.get('linked_brand', ''),
            'retail':             weekly.get('retail', ''),
            'wholesale':          weekly.get('wholesale', ''),
            'after_wholesale':    weekly.get('after_wholesale', ''),
            'conflict_type':      conflict_type,
            'conflict_dates':     [d.strftime('%m/%d') for d in conflict_dates_sorted],
            'plan':               plan,
            'interrupting_deal_type': interrupting[0].get('section', 'monthly').lower() if interrupting else 'monthly',
            'interrupting_deal':  {
                'brand':         interrupting[0].get('brand') if interrupting else '',
                'discount':      interrupting[0].get('discount') if interrupting else '',
                'vendor_contrib': interrupting[0].get('vendor_contrib') if interrupting else '',
                'locations':     format_location_set(conflict_stores) if conflict_stores else (interrupting[0].get('locations') if interrupting else ''),
                'google_row':    interrupting[0].get('google_row') if interrupting else None,
                'mis_id':        interrupting[0].get('mis_id') if interrupting else '',
                'deal_info':     interrupting[0].get('deal_info') if interrupting else '',
            },
        })

    return splits_required, no_conflict


# ── Phase 1: Planning ─────────────────────────────────────────────────────────

def build_split_plan(
    sections_data: dict[str, pd.DataFrame],
    target_month: int,
    target_year:  int,
    bracket_map: dict | None = None,
    prefix_map:  dict | None = None,
) -> dict[str, Any]:
    """
    Phase 1: Analyze Google Sheet sections and produce a 4-step slicing plan.
    Migrated from monolith api_split_audit_planning() (~line 31850).

    Returns:
        {
            'weekly_deals': [...],
            'tier1_deals':  [...],
            'splits_required': [...],
            'no_conflict':  [...],
            'date_context': 'January 2026',
        }
    """
    bmap = bracket_map or {}
    pmap = prefix_map or {}

    def gc(row: pd.Series, names: list[str], default: Any = '') -> Any:
        return get_col(row, names, default, bmap, pmap)

    weekly_deals: list[dict] = []
    tier1_deals:  list[dict] = []

    # ── Weekly (Tier 2) ───────────────────────────────────────────────────────
    weekly_df = sections_data.get('weekly', pd.DataFrame())
    if not weekly_df.empty:
        multi_day_groups, row_to_group = detect_multi_day_groups(weekly_df, 'weekly', bmap, pmap)
        processed_groups: set[str] = set()

        for idx, row in weekly_df.iterrows():
            brand = str(gc(row, ['[Brand]', 'Brand'], '')).strip()
            if not brand:
                continue

            true_row   = int(row.get('_SHEET_ROW_NUM', idx + 2))
            group_id   = row_to_group.get(true_row)
            weekday_raw = str(gc(row, ['[Weekday]', 'Weekday', 'Day of Week'], '-')).strip()

            if group_id and group_id in multi_day_groups:
                if group_id in processed_groups:
                    continue
                processed_groups.add(group_id)
                expanded_dates = get_all_weekdays_for_multiday_group(
                    multi_day_groups[group_id], weekly_df, 'weekly', target_month, target_year
                )
                weekday_raw = ', '.join(multi_day_groups[group_id].get('weekdays', []))
            else:
                expanded_dates = expand_weekday_to_dates(weekday_raw, target_month, target_year)

            loc_raw, exc_raw = resolve_location_columns(row)
            locations = format_location_display(loc_raw, exc_raw)

            wholesale_val     = gc(row, ['Wholesale', 'Wholesale?'], '')
            retail_val        = gc(row, ['Retail', 'Retail?'], '')
            after_wholesale_v = gc(row, ['Rebate After Wholesale Discount?', 'After Wholesale', 'After Wholesale?'], '')
            truthy = ('TRUE', 'YES', '1', 'X', '✔', 'CHECKED')

            weekly_deals.append({
                'brand':         brand,
                'weekday':       weekday_raw,
                'discount':      str(gc(row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], '-')).strip(),
                'vendor_contrib': str(gc(row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], '-')).strip(),
                'locations':     locations,
                'mis_id':        str(gc(row, ['MIS ID', 'ID'], '')).strip(),
                'expanded_dates': expanded_dates,
                'section':       'weekly',
                'google_row':    true_row,
                'deal_info':     str(gc(row, ['Deal info', 'Deal Info', 'Deal'], '')).strip(),
                'special_notes': str(gc(row, ['Special Notes', 'Notes'], '')).strip(),
                'categories':    str(gc(row, ['[Category]', 'Categories'], '')).strip(),
                'retail':        'TRUE' if str(retail_val).upper() in truthy else 'FALSE',
                'wholesale':     'TRUE' if str(wholesale_val).upper() in truthy else 'FALSE',
                'after_wholesale': 'TRUE' if str(after_wholesale_v).upper() in truthy else 'FALSE',
            })

    # ── Tier 1: Monthly + Sale ────────────────────────────────────────────────
    for section_key in ('monthly', 'sale'):
        section_df = sections_data.get(section_key, pd.DataFrame())
        if section_df.empty:
            continue

        for idx, row in section_df.iterrows():
            brand = str(gc(row, ['[Brand]', 'Brand'], '')).strip()
            if not brand:
                continue

            true_row = int(row.get('_SHEET_ROW_NUM', idx + 2))

            if section_key == 'monthly':
                date_raw = get_monthly_day_of_month(row) or '-'
                expanded_dates = parse_monthly_dates(date_raw, target_month, target_year)
            else:  # sale
                date_raw = str(gc(row, ['Contracted Duration (MM/DD/YY - MM/DD/YY)',
                                         'Contracted Duration', 'Sale Runs:'], '-')).strip()
                expanded_dates = parse_sale_dates(date_raw, target_month, target_year)

            if not expanded_dates:
                continue

            loc_raw, exc_raw = resolve_location_columns(row)
            tier1_deals.append({
                'brand':         brand,
                'date_raw':      date_raw,
                'discount':      str(gc(row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], '-')).strip(),
                'vendor_contrib': str(gc(row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], '-')).strip(),
                'locations':     format_location_display(loc_raw, exc_raw),
                'mis_id':        str(gc(row, ['MIS ID', 'ID'], '')).strip(),
                'expanded_dates': expanded_dates,
                'section':       section_key,
                'google_row':    true_row,
                'deal_info':     str(gc(row, ['Deal info', 'Deal Info', 'Deal'], '')).strip(),
            })

    # ── Conflict detection ────────────────────────────────────────────────────
    splits_required, no_conflict = detect_split_requirements(
        weekly_deals, tier1_deals, target_month, target_year
    )

    try:
        date_context = datetime(target_year, target_month, 1).strftime('%B %Y')
    except ValueError:
        date_context = f"{target_month}/{target_year}"

    return {
        'weekly_deals':     weekly_deals,
        'tier1_deals':      tier1_deals,
        'splits_required':  splits_required,
        'no_conflict':      no_conflict,
        'date_context':     date_context,
    }


# ── Phase 2: Gap Check ────────────────────────────────────────────────────────

def verify_gap_closure(
    split_plan: dict[str, Any],
    mis_df: pd.DataFrame,
) -> dict[str, Any]:
    """
    Phase 2: Verify that manually entered MIS splits have closed all timeline gaps.
    Migrated from monolith api_split_audit_gap_check() (~line 32133).

    Checks: For each conflict date in splits_required, confirm no active Weekly
    deal is running in MIS on that date + weekday combination.

    Returns:
        {
            'missing_gaps':  [...],  # Still active on conflict dates (BAD)
            'verified_gaps': [...],  # Properly gapped (GOOD)
        }
    """
    splits_required: list[dict] = split_plan.get('splits_required', [])

    if mis_df is None or mis_df.empty:
        return {'missing_gaps': [], 'verified_gaps': []}

    mis_df = mis_df.copy()
    mis_df['Start_DT'] = pd.to_datetime(mis_df['Start date'], errors='coerce')
    mis_df['End_DT']   = pd.to_datetime(mis_df['End date'],   errors='coerce')

    missing_gaps:  list[dict] = []
    verified_gaps: list[dict] = []

    for req in splits_required:
        brand = req['brand']
        conflict_dates_str: list[str] = req.get('conflict_dates', [])

        # Fuzzy brand match in MIS
        relevant_mis = mis_df[
            mis_df['Brand'].astype(str).apply(
                lambda x: fuzz.token_set_ratio(x.lower(), brand.lower()) > 85
            )
        ]
        if relevant_mis.empty:
            continue

        for d_str in conflict_dates_str:
            try:
                parts = d_str.split('/')
                check_dt = datetime(
                    int(split_plan.get('target_year', datetime.now().year)),
                    int(parts[0]), int(parts[1])
                )
                ts_check = pd.Timestamp(check_dt)

                active_on_conflict = relevant_mis[
                    (relevant_mis['Start_DT'] <= ts_check) &
                    (relevant_mis['End_DT']   >= ts_check)
                ]

                actually_active = [
                    r for _, r in active_on_conflict.iterrows()
                    if _check_mis_weekday_active(check_dt.date(), str(r.get('Weekday', '')))
                ]

                if actually_active:
                    r = actually_active[0]
                    missing_gaps.append({
                        'brand':               brand,
                        'weekday':             req.get('weekday'),
                        'mis_id':              str(r.get('ID', 'Unknown')),
                        'mis_end_date':        str(r.get('End date', '')),
                        'expected_gap_dates':  [d_str],
                    })
                else:
                    verified_gaps.append({'brand': brand, 'gap_date': d_str})

            except Exception:
                continue

    return {
        'missing_gaps':  missing_gaps,
        'verified_gaps': verified_gaps,
    }


# ── Phase 3: Final (single-deal per date) check ───────────────────────────────

def build_final_entry_payload(plan_row: dict[str, Any]) -> dict[str, Any]:
    """
    Phase 3: Construct the MIS entry payload from a plan row.
    This payload drives Selenium automation (mis_entry.py) and
    also serves as the ValidationEngine target_record.

    Returns a flat dict ready to be passed to mis_entry.fill_deal_form().
    """
    return {
        'brand':         plan_row.get('brand', ''),
        'linked_brand':  plan_row.get('linked_brand', ''),
        'weekday':       plan_row.get('weekday', ''),
        'discount':      plan_row.get('discount', ''),
        'vendor_contrib': plan_row.get('vendor_contrib', ''),
        'locations':     plan_row.get('locations', ''),
        'categories':    plan_row.get('categories', ''),
        'start_date':    plan_row.get('start_date', ''),
        'end_date':      plan_row.get('end_date', ''),
        'is_wholesale':  plan_row.get('wholesale', 'FALSE') == 'TRUE',
        'is_retail':     plan_row.get('retail', 'FALSE') == 'TRUE',
        'after_wholesale': plan_row.get('after_wholesale', 'FALSE') == 'TRUE',
        'deal_info':     plan_row.get('deal_info', ''),
        'special_notes': plan_row.get('special_notes', ''),
        'google_row':    plan_row.get('google_row'),
        'action':        plan_row.get('action', ''),
    }


def verify_final_entry(
    plan_row: dict[str, Any],
    mis_df: pd.DataFrame,
) -> dict[str, Any]:
    """
    Phase 4: After user manually saves in MIS, verify the saved data matches
    the plan by re-checking against a freshly pulled MIS CSV.

    NOTE: MIS has no live API. User must pull a new CSV to reflect saved changes.
    Migrated from monolith api_split_audit_final_check() (~line 33217).
    """
    brand      = plan_row.get('brand', '')
    start_date = plan_row.get('start_date', '')
    end_date   = plan_row.get('end_date', '')

    if mis_df is None or mis_df.empty:
        return {'verified': False, 'error': 'No MIS CSV provided'}

    mis_df = mis_df.copy()
    mis_df['Start_DT'] = pd.to_datetime(mis_df['Start date'], errors='coerce')
    mis_df['End_DT']   = pd.to_datetime(mis_df['End date'],   errors='coerce')

    # Find matching MIS entries by brand fuzzy match + date range
    brand_matched = mis_df[
        mis_df['Brand'].astype(str).apply(
            lambda x: fuzz.token_set_ratio(x.lower(), brand.lower()) > 85
        )
    ]

    if brand_matched.empty:
        return {'verified': False, 'error': f"No MIS entries found for brand '{brand}'"}

    plan_start_dt = _parse_dt(start_date)
    plan_end_dt   = _parse_dt(end_date)

    if plan_start_dt:
        ts_start = pd.Timestamp(plan_start_dt)
        brand_matched = brand_matched[brand_matched['Start_DT'] == ts_start]

    matches = brand_matched.to_dict('records')

    if not matches:
        return {
            'verified': False,
            'error': f"No MIS entry found for {brand} starting {start_date}",
        }

    entry = matches[0]
    issues: list[str] = []

    act_end = str(entry.get('End date', '')).strip()
    if plan_end_dt and act_end:
        act_end_dt = _parse_dt(act_end)
        if act_end_dt and abs((act_end_dt - plan_end_dt).days) > 0:
            issues.append(f"End date: expected '{end_date}', got '{act_end}'")

    return {
        'verified':   len(issues) == 0,
        'issues':     issues,
        'mis_id':     str(entry.get('ID', '')),
        'brand':      str(entry.get('Brand', '')),
        'start_date': str(entry.get('Start date', '')),
        'end_date':   str(entry.get('End date', '')),
        'mis_entry':  entry,
    }
