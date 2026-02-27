# =============================================================================
# src/core/matcher.py — v2.0
# ID Matcher logic engine. No Flask, no Selenium.
# Consumed by src/api/mis_matcher.py routes.
#
# Migrated from monolith:
#   detect_multi_day_groups()        ~line 5374
#   should_skip_end420_row()         ~line 5437
#   enhanced_match_mis_ids()         ~line 5457
#   generate_mis_csv_with_multiday() ~line 6578
#
# SESSION RULE: bracket_map / prefix_map passed as params — callers load from
# SessionManager before calling these functions.
# =============================================================================
from __future__ import annotations

import hashlib
import re
import time
from typing import Any, Dict, List, Optional, Tuple

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

from src.utils.date_helpers import get_monthly_day_of_month, parse_end_date
from src.utils.location_helpers import (
    resolve_location_columns,
    format_location_display,
    format_csv_locations,
)
from src.utils.brand_helpers import (
    parse_multi_brand,
    match_mis_ids_to_brands,
    load_brand_settings,
)
from src.utils.sheet_helpers import (
    get_col,
    parse_percentage,
    parse_mis_id_cell,
    format_csv_categories,
)


# ---------------------------------------------------------------------------
# Multi-Day Group Detection
# ---------------------------------------------------------------------------

def detect_multi_day_groups(
    google_df: pd.DataFrame,
    section_type: str = 'weekly',
    bracket_map: Dict | None = None,
    prefix_map: Dict | None = None,
) -> Tuple[Dict[str, Dict], Dict[int, str]]:
    """
    Group multi-day Google Sheet rows by composite MD5 hash key.

    ARCHITECTURE CONSTANT hash key formula (never change):
        "{brand}|{discount}|{vendor_contrib}|{locations}|{categories}|
         {notes}|{deal_info}|{start}|{end}"

    Returns:
        (multi_day_groups, row_to_group)
    """
    bmap = bracket_map or {}
    pmap = prefix_map or {}

    def gc(row: pd.Series, names: List[str], default: Any = '') -> Any:
        return get_col(row, names, default, bmap, pmap)

    groups: Dict[str, Dict] = {}
    row_to_group: Dict[int, str] = {}

    for _, g_row in google_df.iterrows():
        brand_raw = str(gc(g_row, ['[Brand]', 'Brand'], '')).strip()
        if not brand_raw:
            continue

        if section_type == 'weekly':
            weekday_raw = str(gc(g_row, ['[Weekday]', 'Weekday', 'Day of Week'], '')).strip().title()
        elif section_type == 'monthly':
            weekday_raw = get_monthly_day_of_month(g_row).title()
        else:
            weekday_raw = str(gc(g_row, ['[Weekday]', 'Sale Runs:', 'Contracted Duration',
                                         'Weekday/ Day of Month', 'Day of Week', 'Weekday'], '')).strip().title()

        true_row = int(g_row['_SHEET_ROW_NUM']) if '_SHEET_ROW_NUM' in g_row.index else g_row.name + 2

        discount       = parse_percentage(gc(g_row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], ''))
        vendor_contrib = parse_percentage(gc(g_row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], ''))
        loc_raw, exc_raw = resolve_location_columns(g_row)
        locations  = format_location_display(loc_raw, exc_raw)
        categories = format_csv_categories(
            str(gc(g_row, ['[Category]', 'Categories'], '')),
            str(gc(g_row, ['Category Exceptions'], '')),
        )
        special_notes = str(g_row.get('SPECIAL NOTES', '')).strip()
        deal_info     = str(gc(g_row, ['Deal Information', 'Deal Info'], '')).strip()
        contracted    = gc(g_row, ['Contracted Duration (MM/DD/YY - MM/DD/YY)', 'Contracted Duration'], '')
        start_date, end_date = parse_end_date(contracted)

        group_key = (f"{brand_raw}|{discount}|{vendor_contrib}|{locations}|"
                     f"{categories}|{special_notes}|{deal_info}|{start_date}|{end_date}")
        group_id  = hashlib.md5(group_key.encode()).hexdigest()[:12]

        has_missing = not weekday_raw or weekday_raw.lower() in ('', 'nan', 'none')

        if group_id not in groups:
            groups[group_id] = {'rows': [], 'weekdays': [], 'brand': brand_raw, 'has_missing_weekday': has_missing}

        groups[group_id]['rows'].append(true_row)
        groups[group_id]['weekdays'].append(weekday_raw if weekday_raw else '[!] ⚠️⚠️  MISSING')
        if has_missing:
            groups[group_id]['has_missing_weekday'] = True
        row_to_group[true_row] = group_id

    multi = {gid: gd for gid, gd in groups.items() if len(gd['rows']) > 1}
    return multi, row_to_group


# ---------------------------------------------------------------------------
# Row Filtering
# ---------------------------------------------------------------------------

def should_skip_end420_row(row_dict: Dict) -> bool:
    """Return True when row contains 'END420' exactly in 2+ columns."""
    count = 0
    for v in row_dict.values():
        if isinstance(v, str) and v.strip().upper() == 'END420':
            count += 1
            if count > 1:
                return True
    return False


# ---------------------------------------------------------------------------
# Core Matcher
# ---------------------------------------------------------------------------

def enhanced_match_mis_ids(
    google_df: pd.DataFrame,
    mis_df: pd.DataFrame,
    brand_list: List[str] | None = None,
    brand_settings: Dict[str, str] | None = None,
    section_type: str = 'weekly',
    bracket_map: Dict | None = None,
    prefix_map: Dict | None = None,
    tab_name: str = '',
) -> List[Dict]:
    """
    V6-compatible enhanced fuzzy matching with SUGGESTIONS logic.

    Scoring weights (ARCHITECTURE CONSTANTS):
        Brand 50 pts | Discount 30 pts | Vendor 15 pts | Category 5 pts | Temporal ±10

    Status thresholds: HIGH ≥ 95 | MEDIUM ≥ 70 | LOW < 70
    """
    bmap = bracket_map or {}
    pmap = prefix_map or {}
    brand_settings = brand_settings or {}

    def gc(row: pd.Series, names: List[str], default: Any = '') -> Any:
        return get_col(row, names, default, bmap, pmap)

    if section_type == 'weekly':
        multi_day_groups, row_to_group = detect_multi_day_groups(google_df, section_type, bmap, pmap)
    else:
        multi_day_groups, row_to_group = {}, {}

    # MIS ID column detection
    id_col_name = 'ID'
    for col in ['ID', 'id', 'MIS ID', 'Mis Id', 'MIS_ID', 'mis_id']:
        if col in mis_df.columns:
            id_col_name = col
            break
    # DIAGNOSTIC — remove after confirming
    print(f"[MATCHER-DEBUG] mis_df columns: {list(mis_df.columns[:10])}")
    print(f"[MATCHER-DEBUG] google_df columns: {list(google_df.columns[:10])}")
    print(f"[MATCHER-DEBUG] bmap has {len(bmap)} keys, pmap has {len(pmap)} keys")
    if not google_df.empty:
        first_row = google_df.iloc[0]
        print(f"[MATCHER-DEBUG] First row brand_raw: '{get_col(first_row, ['[Brand]', 'Brand'], '', bmap, pmap)}'")
        print(f"[MATCHER-DEBUG] First row weekday: '{get_col(first_row, ['[Weekday]', 'Weekday'], '', bmap, pmap)}'")

    def clean_id(row: pd.Series) -> str:
        val = row.get(id_col_name)
        if pd.isna(val):
            return ''
        s = str(val).strip()
        return s[:-2] if s.endswith('.0') else s

    def target_day(d: Any) -> str:
        s = str(d).strip().lower()
        for pfx, full in [('mon','monday'),('tue','tuesday'),('wed','wednesday'),
                          ('thu','thursday'),('fri','friday'),('sat','saturday'),('sun','sunday')]:
            if pfx in s: return full
        return ''

    # Temporal scoring: parse tab name for month/year
    _months = ['january','february','march','april','may','june',
               'july','august','september','october','november','december']
    _tab_m, _tab_y = -1, -1
    for part in tab_name.lower().split():
        if part in _months: _tab_m = _months.index(part) + 1
        if part.isdigit() and len(part) == 4: _tab_y = int(part)

    def end_ym(date_str: str) -> Tuple[int, int]:
        s = str(date_str).strip()
        m = re.match(r'^(\d{4})-(\d{1,2})-\d', s)
        if m: return int(m.group(1)), int(m.group(2))
        m = re.match(r'^(\d{1,2})/\d+/(\d{4})$', s)
        if m: return int(m.group(2)), int(m.group(1))
        m = re.match(r'^(\d{1,2})/\d+/(\d{2})$', s)
        if m: return 2000+int(m.group(2)), int(m.group(1))
        return -1, -1

    matches: List[Dict] = []

    for g_idx, g_row in google_df.iterrows():
        if should_skip_end420_row(g_row.to_dict()):
            continue

        brand_raw = str(gc(g_row, ['[Brand]', 'Brand'], '')).strip()
        if not brand_raw:
            continue

        if section_type == 'weekly':
            weekday_raw = str(gc(g_row, ['[Weekday]', 'Weekday', 'Day of Week'], '')).strip()
        elif section_type == 'monthly':
            weekday_raw = get_monthly_day_of_month(g_row)
        else:
            weekday_raw = str(gc(g_row, ['[Weekday]', 'Sale Runs:', 'Contracted Duration',
                                         'Weekday/ Day of Month', 'Day of Week', 'Weekday'], '')).strip()

        true_row = int(gc(g_row, ['_SHEET_ROW_NUM'], g_idx + 2))

        base_grp_meta = None
        if true_row in row_to_group:
            gid = row_to_group[true_row]
            if gid in multi_day_groups:
                gd = multi_day_groups[gid]
                cidx = gd['rows'].index(true_row)
                base_grp_meta = {'group_id': gid, 'total_days': len(gd['rows']),
                                 'row_numbers': gd['rows'], 'weekdays': gd['weekdays'],
                                 'current_index': cidx, 'has_missing_weekday': gd['has_missing_weekday']}

        wkday_tgt      = target_day(weekday_raw)
        discount       = parse_percentage(gc(g_row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], ''))
        vendor_contrib = parse_percentage(gc(g_row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], ''))
        category_raw   = str(gc(g_row, ['[Category]', 'Categories'], '')).strip()
        cur_sheet_id   = str(gc(g_row, ['MIS ID', 'ID'], '')).strip()

        ind_brands       = parse_multi_brand(brand_raw)
        is_multi         = len(ind_brands) > 1
        brand_to_ids: Dict = {}
        if is_multi and cur_sheet_id:
            brand_to_ids = match_mis_ids_to_brands(cur_sheet_id, ind_brands, mis_df)

        brands_to_process = ind_brands if ind_brands else [brand_raw]

        for b_idx, cur_brand in enumerate(brands_to_process):
            grp_meta = None
            if base_grp_meta:
                cidx = base_grp_meta['current_index']
                is_first = (cidx == 0) and (b_idx == 0)
                grp_meta = {**base_grp_meta,
                            'total_entries': base_grp_meta['total_days'] * len(brands_to_process),
                            'is_first': is_first, 'is_first_brand': b_idx == 0,
                            'brand_raw': brand_raw, 'is_multi_brand': is_multi,
                            'total_brands': len(brands_to_process)}

            try:
                if wkday_tgt:
                    candidates = mis_df[mis_df['Weekday'].astype(str).str.lower()
                                        .str.contains(wkday_tgt, regex=False, na=False)]
                else:
                    candidates = mis_df.copy()
            except Exception:
                candidates = mis_df.copy()

            suggestions: List[Dict] = []
            brand_lc    = cur_brand.strip().lower()
            glinked     = brand_settings.get(cur_brand.strip(), '')
            glinked_lc  = glinked.lower() if glinked else ''

            if is_multi:
                brand_cur_id = ', '.join(f'{tag}: {mid}' for tag, mid in brand_to_ids.get(cur_brand, []))
            else:
                brand_cur_id = cur_sheet_id

            for _, c_row in candidates.iterrows():
                mis_brand    = str(c_row.get('Brand', '')).strip()
                if not mis_brand: continue
                mis_brand_lc = mis_brand.lower()
                mis_linked   = str(c_row.get('Linked Brand (if applicable)', '')).strip()
                mis_linked_lc = mis_linked.lower() if mis_linked and mis_linked.lower() not in ('n/a','nan','') else ''

                best_ratio, match_type, lb_match = 0, 'fuzzy', False

                if brand_lc == mis_brand_lc:
                    best_ratio, match_type = 100, 'exact'
                    if glinked_lc and mis_linked_lc and glinked_lc == mis_linked_lc:
                        lb_match = True
                elif brand_lc in mis_brand_lc or mis_brand_lc in brand_lc:
                    best_ratio, match_type = 40, 'partial_contains'
                elif glinked_lc:
                    if glinked_lc == mis_brand_lc:
                        best_ratio, match_type, lb_match = 90, 'linked_brand_match', True
                    elif mis_linked_lc and glinked_lc == mis_linked_lc:
                        fr = fuzz.token_set_ratio(brand_lc, mis_brand_lc)
                        if fr > 80: best_ratio, match_type, lb_match = fr, 'linked_brand_partial', True
                        else:       best_ratio, match_type = fr * 0.7, 'linked_brand_weak'
                    else:
                        best_ratio, match_type = fuzz.token_set_ratio(brand_lc, mis_brand_lc) * 0.6, 'fuzzy_no_linked'
                else:
                    fr = fuzz.token_set_ratio(brand_lc, mis_brand_lc)
                    if fr > 85 and (brand_lc in mis_brand_lc or mis_brand_lc in brand_lc):
                        best_ratio, match_type = 50, 'fuzzy_partial'
                    else:
                        best_ratio, match_type = fr, 'fuzzy'

                if best_ratio < 60: continue

                score_brand = (best_ratio / 100) * 50 + (5 if lb_match else 0)
                apply_bonus = best_ratio >= 75

                mis_disc = float(c_row.get('Daily Deal Discount', 0) or 0)
                score_disc = 0
                if apply_bonus:
                    if abs(discount - mis_disc) < 0.01: score_disc = 30
                    elif abs(discount - mis_disc) <= 5:  score_disc = 15

                mis_vend = float(c_row.get('Discount paid by vendor', 0) or 0)
                score_vend = 15 if apply_bonus and abs(vendor_contrib - mis_vend) < 0.01 else 0

                mis_cat = str(c_row.get('Category', '')).strip()
                score_cat = 0
                if category_raw and mis_cat:
                    gcats = {c.strip().lower() for c in category_raw.split(',') if c.strip()}
                    mcats = {c.strip().lower() for c in mis_cat.split(',') if c.strip()}
                    if gcats == mcats or gcats.issubset(mcats): score_cat = 5
                    elif gcats & mcats: score_cat = 3
                elif not category_raw and not mis_cat:
                    score_cat = 5

                score_temp, temp_tag = 0, ''
                if _tab_m > 0 and _tab_y > 0:
                    ey, em = end_ym(str(c_row.get('End date', '')))
                    if ey > 0:
                        tab_ym = _tab_y * 12 + _tab_m
                        e_ym   = ey * 12 + em
                        if   e_ym == tab_ym:     score_temp, temp_tag = 10, 'current'
                        elif e_ym == tab_ym + 1: score_temp, temp_tag =  5, 'next'
                        elif e_ym > tab_ym:      score_temp, temp_tag =  3, 'future'
                        else:                     score_temp, temp_tag = -5, 'expired'

                conf = min(round(score_brand + score_disc + score_vend + score_cat + score_temp), 100)

                from src.utils.location_helpers import normalize_location_string
                locs       = normalize_location_string(str(c_row.get('Store', '')).strip())
                clean_mid  = clean_id(c_row)
                raw_csv: Dict[str, str] = {}
                for col in c_row.index:
                    try:
                        val = c_row[col]
                        if hasattr(val, 'iloc'): val = val.iloc[0] if len(val) > 0 else ''
                        vs = str(val).strip() if val is not None else ''
                        if vs and vs.lower() not in ('','nan','none','nat'): raw_csv[col] = vs
                    except Exception: pass

                reasoning = [f'Brand: {int(best_ratio)}%']
                if match_type == 'exact':              reasoning.append('(exact)')
                elif match_type == 'linked_brand_match': reasoning.append('(linked)')
                elif 'partial' in match_type:          reasoning.append('(partial - similar name)')
                if lb_match:  reasoning.append('[LB✓]')
                if temp_tag == 'current':  reasoning.append('✅Current')
                elif temp_tag == 'expired': reasoning.append('❌Expired')

                suggestions.append({
                    'mis_id': clean_mid, 'confidence': conf, 'temporal_score': score_temp,
                    'reasoning': ' '.join(reasoning),
                    'mis_data': {
                        'id': clean_mid, 'brand': mis_brand,
                        'linked_brand': str(c_row.get('Linked Brand (if applicable)', 'N/A')),
                        'locations': locs, 'weekdays': str(c_row.get('Weekday', 'N/A')),
                        'start_date': str(c_row.get('Start date', 'N/A')),
                        'end_date':   str(c_row.get('End date', 'N/A')),
                        'category': mis_cat or 'N/A', 'discount': mis_disc,
                        'vendor_contribution': mis_vend, 'raw_csv_data': raw_csv,
                        'linked_brand_match': lb_match, 'match_type': match_type,
                    },
                })

            suggestions = sorted(suggestions, key=lambda x: (x['confidence'], x.get('temporal_score', 0)), reverse=True)[:5]

            matched_mid, status = '', 'LOW'
            if suggestions:
                top = suggestions[0]['confidence']
                if top >= 85: matched_mid = suggestions[0]['mis_id']
                if   top >= 95: status = 'HIGH'
                elif top >= 70: status = 'MEDIUM'

            linked_from_settings = ''
            lk = cur_brand.lower().strip()
            if lk in brand_settings:
                tgt = brand_settings[lk]
                if tgt.lower() != cur_brand.lower(): linked_from_settings = tgt

            # raw_row_data with backward-compat alias keys
            raw_row: Dict[str, str] = {}
            for col in g_row.index:
                try:
                    val = g_row[col]
                    if hasattr(val, 'iloc'): val = val.iloc[0] if len(val) > 0 else ''
                    vs = str(val).strip() if val is not None else ''
                    if vs and vs.lower() not in ('','nan','none','nat','<na>'): raw_row[col] = vs
                except Exception: pass
            _bre = re.compile(r'\[([^\]]+)\]')
            for key, val in list(raw_row.items()):
                m = _bre.search(str(key))
                if m:
                    pfx = str(key)[:m.start()].strip()
                    if pfx and pfx not in raw_row: raw_row[pfx] = val

            matches.append({
                'google_row': true_row, 'brand': cur_brand, 'brand_raw': brand_raw,
                'linked_brand': linked_from_settings, 'is_multi_brand': is_multi,
                'multi_brand_index': b_idx if is_multi else None,
                'multi_brand_total': len(brands_to_process) if is_multi else 1,
                'weekday': weekday_raw, 'section': section_type,
                'discount': discount, 'vendor_contrib': vendor_contrib,
                'current_sheet_id': brand_cur_id, 'current_sheet_id_raw': cur_sheet_id,
                'matched_mis_id': matched_mid, 'confidence': suggestions[0]['confidence'] if suggestions else 0,
                'status': status, 'suggestions': suggestions,
                'locations': format_location_display(*resolve_location_columns(g_row)),
                'categories': format_csv_categories(str(gc(g_row, ['[Category]', 'Categories'], '')),
                                                    str(gc(g_row, ['Category Exceptions'], ''))),
                'special_notes': str(g_row.get('SPECIAL NOTES', '')),
                'deal_info': str(gc(g_row, ['Deal Information', 'Deal Info'], '')),
                'blaze_discount_title': str(gc(g_row, ['Blaze Discount Title'], '')),
                'multi_day_group': grp_meta, 'raw_row_data': raw_row,
                'retail':          str(gc(g_row, ['Retail?', 'Retail'], '')).strip(),
                'wholesale':       str(gc(g_row, ['Wholesale?', 'Wholesale'], '')).strip(),
                'after_wholesale': str(gc(g_row, ['Rebate After Wholesale', 'After Wholesale',
                                                   'After Wholesale Discount', 'Rebate after Wholesale?'], '')).strip(),
                'min_weight':  str(gc(g_row, ['Min Weight', 'Minimum Weight', 'Min'], '')).strip(),
                'max_weight':  str(gc(g_row, ['Max Weight', 'Maximum Weight', 'Max'], '')).strip(),
                'date_raw':    str(gc(g_row, ['Contracted Duration (MM/DD/YY - MM/DD/YY)',
                                              'Contracted Duration', 'Sale Runs:'], '')).strip(),
            })

    return matches


# ---------------------------------------------------------------------------
# CSV Generation
# ---------------------------------------------------------------------------

def generate_mis_csv_with_multiday(
    google_df: pd.DataFrame,
    section_type: str = 'weekly',
    spreadsheet_id: str = '',
    bracket_map: Dict | None = None,
    prefix_map: Dict | None = None,
) -> Tuple[List[Dict], Dict]:
    """Generate MIS CSV rows from Google Sheet data. Returns (rows, summary)."""
    bmap = bracket_map or {}
    pmap = prefix_map or {}

    def gc(row: pd.Series, names: List[str], default: Any = '') -> Any:
        return get_col(row, names, default, bmap, pmap)

    brand_settings: Dict = {}
    if spreadsheet_id:
        try:
            brand_settings = load_brand_settings(spreadsheet_id)
        except Exception:
            pass

    multi_day_groups, row_to_group = detect_multi_day_groups(google_df, section_type, bmap, pmap)

    _wd_order = {'monday':1,'mon':1,'tuesday':2,'tue':2,'wednesday':3,'wed':3,
                 'thursday':4,'thu':4,'friday':5,'fri':5,'saturday':6,'sat':6,'sunday':7,'sun':7}

    def wk_sort(s: str) -> int:
        d = str(s).lower()
        for k, v in _wd_order.items():
            if k in d: return v
        return 999

    csv_rows: List[Dict] = []
    processed_groups: set = set()
    retail_alerts: List[Dict] = []
    multiday_details: List[Dict] = []

    for g_idx, g_row in google_df.iterrows():
        if should_skip_end420_row(g_row.to_dict()):
            continue

        brand_raw = str(gc(g_row, ['[Brand]', 'Brand'], '')).strip()
        if not brand_raw:
            continue

        if section_type == 'weekly':
            weekday_input = str(gc(g_row, ['[Weekday]', 'Weekday', 'Day of Week'], '')).strip().title()
        elif section_type == 'monthly':
            weekday_input = get_monthly_day_of_month(g_row).title()
        else:
            weekday_input = str(gc(g_row, ['[Weekday]', 'Sale Runs:', 'Contracted Duration',
                                            'Weekday/ Day of Month', 'Day of Week', 'Weekday'], '')).strip().title()

        true_row  = int(g_row['_SHEET_ROW_NUM']) if '_SHEET_ROW_NUM' in g_row.index else g_idx + 2
        in_group  = (true_row in row_to_group and row_to_group[true_row] in multi_day_groups)
        sn_pkg: List[Dict] = []
        di_pkg: List[Dict] = []

        if in_group:
            gid = row_to_group[true_row]
            if gid in processed_groups: continue
            processed_groups.add(gid)

            gd       = multi_day_groups[gid]
            ref_rows = google_df[google_df['_SHEET_ROW_NUM'] == gd['rows'][0]]
            ref_row  = ref_rows.iloc[0] if not ref_rows.empty else g_row

            raw_wds    = [w for w in gd['weekdays'] if w and w != '[!] ⚠️⚠️  MISSING']
            unique_wds = sorted(set(raw_wds), key=wk_sort)
            weekday_val       = ', '.join(unique_wds)
            sort_key          = min([wk_sort(w) for w in unique_wds], default=999)
            multi_day_flag    = f'YES ({len(unique_wds)} days)'
            google_rows_track = ', '.join(str(r) for r in gd['rows'])
            data_source       = ref_row

            row_day_combo = [f'(Row {r}) ({gd["weekdays"][i] if i < len(gd["weekdays"]) else "?"})' for i, r in enumerate(gd['rows'])]
            multiday_details.append({
                'brand': str(gc(ref_row, ['[Brand]', 'Brand'], '')).strip(),
                'title_meta': f'({len(unique_wds)} Days)',
                'body_data': ', '.join(row_day_combo),
            })

            for r_num in gd['rows']:
                sub_rows = google_df[google_df['_SHEET_ROW_NUM'] == r_num]
                if sub_rows.empty: continue
                sub = sub_rows.iloc[0]
                if section_type == 'sale':
                    day_v = str(gc(sub, ['[Brand]', 'Brand'], '')).strip()
                elif section_type == 'weekly':
                    day_v = str(gc(sub, ['[Weekday]', 'Weekday', 'Day of Week'], '')).strip()
                else:
                    day_v = get_monthly_day_of_month(sub)
                if str(sub.get('SPECIAL NOTES', '')).strip():
                    sn_pkg.append({'row': r_num, 'day': day_v, 'note': str(sub.get('SPECIAL NOTES', '')).strip()})
                info = str(gc(sub, ['Deal Information', 'Deal Info'], '')).strip()
                if info: di_pkg.append({'row': r_num, 'day': day_v, 'info': info})
        else:
            data_source        = g_row
            weekday_val        = weekday_input
            sort_key           = wk_sort(weekday_val)
            multi_day_flag     = 'NO'
            google_rows_track  = str(true_row)
            note = str(g_row.get('SPECIAL NOTES', '')).strip()
            if note: sn_pkg.append({'row': true_row, 'day': weekday_val, 'note': note})
            info = str(gc(g_row, ['Deal Information', 'Deal Info'], '')).strip()
            if info: di_pkg.append({'row': true_row, 'day': weekday_val, 'info': info})

        discount       = parse_percentage(gc(data_source, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], ''))
        vendor_contrib = parse_percentage(gc(data_source, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], ''))
        cat_raw  = str(gc(data_source, ['[Category]', 'Categories'], ''))
        cat_exc  = str(gc(data_source, ['Category Exceptions'], ''))
        categories = format_csv_categories(cat_raw, cat_exc)
        start_date, end_date = parse_end_date(gc(data_source, ['Contracted Duration (MM/DD/YY - MM/DD/YY)', 'Contracted Duration'], ''))
        loc_raw, exc_raw = resolve_location_columns(data_source)
        store_str = format_csv_locations(loc_raw, exc_raw)

        is_all_locs = 'all locations' in loc_raw.lower()
        if is_all_locs:
            display_store = (f'All Locations Except: {exc_raw}' if exc_raw and exc_raw.lower() not in ('nan','none','') else 'All Locations')
        else:
            display_store = store_str

        is_wholesale = str(gc(data_source, ['Wholesale?', 'Wholesale'], '')).upper() == 'TRUE'
        is_retail    = str(gc(data_source, ['Retail?', 'Retail'],       '')).upper() == 'TRUE'
        rebate_csv, notes_csv, ui_rebate = '', '', '-'

        if is_retail:
            notes_csv  = '[ACTION: CHECK RETAIL TOGGLE] '
            ui_rebate  = 'Retail'
            retail_alerts.append({'brand': brand_raw, 'title_meta': '', 'body_data': f'Row {google_rows_track} ({weekday_val})'})
        elif is_wholesale:
            rebate_csv, ui_rebate = 'Wholesale', 'Wholesale'

        brands_list    = [b.strip() for b in brand_raw.split(',') if b.strip()]
        split_group_id = f'split_{g_idx}_{int(time.time())}' if len(brands_list) > 1 else ''

        for b_idx, cur_brand in enumerate(brands_list):
            linked_val = ''
            if cur_brand.lower() in brand_settings:
                tgt = brand_settings[cur_brand.lower()]
                if tgt.lower() != cur_brand.lower(): linked_val = tgt

            row_cls = ''
            if len(brands_list) > 1:
                if   b_idx == 0:                    row_cls = 'split-group-start'
                elif b_idx == len(brands_list) - 1: row_cls = 'split-group-end'
                else:                               row_cls = 'split-group-middle'

            cat_csv = '' if 'All Categories' in categories else categories

            csv_rows.append({
                'ID': '', 'Weekday': weekday_val, 'Store': store_str,
                'Brand': cur_brand, 'Linked Brand (if applicable)': linked_val,
                'Category': cat_csv, 'Daily Deal Discount': f'{discount:.2f}',
                'Rebate type': rebate_csv, 'Discount paid by vendor': f'{vendor_contrib:.2f}',
                'Rebate After Wholesale Discount?': '', 'Include clearance items?': '',
                'Specialty Discount (non-daily deal)?': '',
                'Start date': start_date, 'End date': end_date,
                'Minimum Weight': '0', 'Maximum Weight': '0', 'Actions': 'Edit Archive',
                'GOOGLE_ROWS': google_rows_track, 'MULTI_DAY_FLAG': multi_day_flag,
                'WEEKDAY_SORT_KEY': sort_key, 'NOTES': notes_csv,
                'SPLIT_GROUP_ID': split_group_id, 'ROW_UI_CLASS': row_cls,
                'DISPLAY_CATEGORY': categories, 'DISPLAY_STORE': display_store,
                'UI_SPECIAL_NOTES': sn_pkg, 'UI_DEAL_INFO': di_pkg, 'UI_REBATE_DISPLAY': ui_rebate,
            })

    csv_rows_sorted = sorted(csv_rows, key=lambda x: x['WEEKDAY_SORT_KEY'])
    summary = {
        'total_rows': len(csv_rows_sorted),
        'multi_day_deals': len([r for r in csv_rows_sorted if r['MULTI_DAY_FLAG'] != 'NO']),
        'single_day_deals': len([r for r in csv_rows_sorted if r['MULTI_DAY_FLAG'] == 'NO']),
        'groups_detected': len(multi_day_groups),
        'retail_alerts': len(retail_alerts),
        'retail_details': retail_alerts,
        'multiday_details': multiday_details,
    }
    return csv_rows_sorted, summary
