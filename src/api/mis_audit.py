# src/api/mis_audit.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# MAudit + Conflict Audit tab routes.
# ⚠️  DEAD CODE: legacy /api/mis/audit and audit_google_vs_mis() are NOT ported.
#     MAudit is the ONLY audit engine.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import re as _re
import traceback
from datetime import datetime
from pathlib import Path

import pandas as pd
from flask import Blueprint, jsonify, request

from src.session import session
from src.integrations.google_sheets import fetch_google_sheet_data, parse_tab_month_year
from src.utils.csv_resolver import resolve_mis_csv_for_route as resolve_mis_csv
from src.utils.sheet_helpers import get_col
from src.utils.location_helpers import format_location_display, resolve_location_columns
from src.utils.fuzzy import generate_fuzzy_suggestions
from src.core.auditor import run_maudit, run_conflict_audit_mis_vs_sheet, run_conflict_audit_sheet_vs_mis
from src.core.validation_engine import engine as validation_engine, ValidationRecord

bp = Blueprint('mis_audit', __name__)

_AUDIT_REPORTS_DIR = Path(__file__).resolve().parent.parent.parent / 'reports' / 'AUDIT_REPORTS'


# ── Legacy Audit (section-keyed — required by displayAuditResults() in blaze.js) ──

@bp.route('/api/mis/audit', methods=['POST'])
def api_mis_audit():
    """
    Legacy audit route called by the 'Run Audit' button.
    Returns {weekly, monthly, sale} keyed results for displayAuditResults().
    Monolith: line 26519.
    """
    try:
        tab_name = request.form.get('tab')
        csv_file = request.files.get('csv')
        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab selected'})
        mis_df = None
        if csv_file:
            mis_df = pd.read_csv(csv_file)
        else:
            pulled_path = session.get('mis_csv_filepath')
            if pulled_path and Path(pulled_path).exists():
                mis_df = pd.read_csv(pulled_path)
            else:
                return jsonify({'success': False, 'error': 'No CSV available. Pull or upload CSV first.'})
        sections_data = fetch_google_sheet_data(tab_name)
        if all(df.empty for df in sections_data.values()):
            return jsonify({'success': False, 'error': 'No data found in selected tab'})
        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()
        all_results: dict[str, list] = {}
        for section in ('weekly', 'monthly', 'sale'):
            df = sections_data.get(section, pd.DataFrame())
            if not df.empty:
                sr = run_maudit(df, mis_df, section, bmap, pmap)
                all_results[section] = (
                    sr.get('mismatches', []) + sr.get('not_found', []) + sr.get('missing_id', [])
                )
            else:
                all_results[section] = []
        return jsonify({'success': True, 'results': all_results})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── MAudit ─────────────────────────────────────────────────────────────────────

@bp.route('/api/mis/maudit', methods=['POST'])
def maudit():
    """
    MAudit: Verify Google Sheet deals against MIS CSV.
    Direction: Sheet → MIS.
    Groups results: verified / mismatches / not_found / missing_id.
    """
    try:
        tab_name       = request.form.get('tab')
        local_csv_path = request.form.get('local_csv_path')

        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab selected'})

        mis_df = resolve_mis_csv(
            csv_file_obj=request.files.get('csv'),
            local_path=local_csv_path,
            session=session,
        )
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No CSV available. Pull or upload CSV first.'})

        sections_data = fetch_google_sheet_data(tab_name)
        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        combined_results = {
            'verified':   [],
            'mismatches': [],
            'not_found':  [],
            'missing_id': [],
        }

        for section_name in ('weekly', 'monthly', 'sale'):
            df = sections_data.get(section_name, pd.DataFrame())
            if df.empty:
                continue
            section_results = run_maudit(df, mis_df, section_name, bmap, pmap)
            for key in combined_results:
                combined_results[key].extend(section_results.get(key, []))

        return jsonify({
            'success': True,
            'results': combined_results,
            'summary': {k: len(v) for k, v in combined_results.items()},
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── Conflict Audit: Sheet → MIS ───────────────────────────────────────────────

@bp.route('/api/mis/gsheet-conflict-audit', methods=['POST'])
def gsheet_conflict_audit():
    """
    Date-aware pre-flight check: Scans Google Sheet for cross-section brand conflicts.
    Returns date_conflicts and brand_conflicts.
    """
    try:
        data     = request.get_json() or {}
        tab_name = data.get('tab', '')

        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        target_month, target_year = parse_tab_month_year(tab_name)
        sections_data = fetch_google_sheet_data(tab_name)

        if all(df.empty for df in sections_data.values()):
            return jsonify({'success': False, 'error': 'No data found in the selected tab'})

        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        result = run_conflict_audit_sheet_vs_mis(
            sections_data, target_month, target_year, bmap, pmap
        )

        return jsonify({'success': True, **result})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── Conflict Audit: MIS → Sheet (Zombies) ─────────────────────────────────────

@bp.route('/api/mis/conflict-audit', methods=['POST'])
def conflict_audit():
    """
    Scans MIS CSV for internal conflicts (active deals with matching Brand+Weekday).
    Returns conflict groups sorted by severity.
    """
    try:
        mis_df = resolve_mis_csv(
            csv_file_obj=request.files.get('csv') if request.files else None,
            session=session,
        )
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No MIS CSV loaded. Pull or upload CSV in Setup.'})

        conflicts = run_conflict_audit_mis_vs_sheet(mis_df)
        return jsonify({
            'success':         True,
            'conflicts':       conflicts,
            'total_active':    len(mis_df),
            'conflict_groups': len(conflicts),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/cleanup-audit', methods=['POST'])
def cleanup_audit():
    """
    Cleanup Audit: find active MIS entries that should be turned off.

    Two detection methods:
    1. Full Field Match — Brand + Weekday + Discount + Vendor% + Locations
       don't match ANY Google Sheet row → likely stale/orphaned deal.
    2. MIS ID Only — MIS ID not present in any Google Sheet MIS ID column.

    Form fields: tab (str), csv (file, optional), local_csv_path (str, optional)
    """
    import traceback as _tb
    from datetime import datetime
    from src.session import session
    from src.utils.sheet_helpers import get_col, parse_percentage, parse_mis_id_cell
    from src.utils.location_helpers import (
        normalize_store_name, normalize_location_string,
        resolve_location_columns, format_location_display,
        resolve_to_store_set, ALL_STORES_SET, _extract_except_stores,
    )
    from src.utils.brand_helpers import parse_multi_brand
    from src.utils.date_helpers import get_monthly_day_of_month
    from src.utils.csv_resolver import resolve_mis_csv_for_route

    try:
        tab_name       = request.form.get('tab', '').strip()
        csv_file       = request.files.get('csv')
        local_csv_path = request.form.get('local_csv_path', '').strip()

        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab selected'})

        # Load MIS CSV
        mis_df = resolve_mis_csv_for_route(
            csv_file=csv_file,
            local_path=local_csv_path or None,
            session=session,
        )
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No MIS CSV. Pull CSV first or upload manually.'})

        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()
        sections_data = fetch_google_sheet_data(tab_name)

        today = datetime.now().date()

        def _parse_date(ds):
            if not ds or str(ds).lower() in ('', 'nan', 'none', 'nat'):
                return None
            for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%m/%d/%y', '%m-%d-%Y'):
                try:
                    return datetime.strptime(str(ds).strip(), fmt).date()
                except ValueError:
                    continue
            return None

        def _is_active(row) -> bool:
            end = _parse_date(str(row.get('End date', '')))
            return end is None or end >= today

        def _section_from_weekday(wd: str) -> str:
            if not wd or str(wd).lower() in ('', 'nan', 'none'):
                return 'sale'
            wdl = str(wd).lower()
            if any(c.isdigit() for c in wdl) and ('-' in wdl or '/' in wdl):
                return 'monthly'
            if any(d in wdl for d in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')):
                return 'weekly'
            return 'monthly'

        def _loc_fset(loc_str: str) -> frozenset:
            s = str(loc_str).strip().lower()
            if s in ('all locations', 'all', '-', '', 'nan', 'none'):
                return frozenset(['all'])
            excepts = _extract_except_stores(loc_str)
            if excepts is not None:
                if excepts:
                    excl = {e.lower() for e in excepts}
                    return frozenset({st.lower() for st in ALL_STORES_SET} - excl)
                return frozenset(['all'])
            locs = [normalize_store_name(l.strip()).lower()
                    for l in loc_str.replace('\n', ',').split(',') if l.strip()]
            return frozenset(['all']) if len(locs) >= len(ALL_STORES_SET) else frozenset(locs)

        # Build sheet reference data
        all_sheet_mis_ids: set = set()
        sheet_entries: list   = []

        for sec_name, df in sections_data.items():
            if df is None or df.empty:
                continue
            for _, row in df.iterrows():
                mid_cell = str(get_col(row, ['MIS ID', 'ID'], '', bmap, pmap)).strip()
                parsed   = parse_mis_id_cell(mid_cell, sec_name)
                for _t, m in parsed.get('all_tagged', []):
                    all_sheet_mis_ids.add(str(m).strip())
                for m in parsed.get('untagged', []):
                    all_sheet_mis_ids.add(str(m).strip())

                brand = str(get_col(row, ['[Brand]', 'Brand'], '', bmap, pmap)).strip()
                if not brand:
                    continue

                if sec_name == 'weekly':
                    weekday = str(get_col(row, ['[Weekday]', 'Weekday', 'Day of Week'], '', bmap, pmap)).strip()
                elif sec_name == 'monthly':
                    weekday = get_monthly_day_of_month(row) or ''
                else:
                    weekday = str(get_col(row, ['[Weekday]', 'Sale Runs:', 'Contracted Duration',
                                                'Weekday/ Day of Month', 'Day of Week'], '', bmap, pmap)).strip()

                discount   = parse_percentage(get_col(row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], '', bmap, pmap))
                vendor_pct = parse_percentage(get_col(row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], '', bmap, pmap))
                loc_r, exc_r = resolve_location_columns(row)
                loc_set      = _loc_fset(format_location_display(loc_r, exc_r))

                for b in parse_multi_brand(brand):
                    sheet_entries.append({
                        'section': sec_name, 'brand': b.lower().strip(),
                        'weekday': weekday.lower(), 'discount': discount,
                        'vendor_pct': vendor_pct, 'loc_set': loc_set,
                    })

        id_col = next((c for c in ('ID', 'id', 'MIS ID', 'Mis Id') if c in mis_df.columns), None)
        if not id_col:
            return jsonify({'success': False, 'error': 'MIS CSV missing ID column'})

        full_match_issues: list = []
        id_only_issues:    list = []

        for _, mis_row in mis_df.iterrows():
            if not _is_active(mis_row):
                continue

            mis_id = str(mis_row.get(id_col, '')).strip()
            if mis_id.endswith('.0'):
                mis_id = mis_id[:-2]
            if not mis_id or mis_id.lower() in ('', 'nan', 'none'):
                continue

            mis_brand   = str(mis_row.get('Brand', '')).strip()
            mis_weekday = str(mis_row.get('Weekday', '')).strip()
            mis_disc    = float(mis_row.get('Daily Deal Discount', 0) or 0)
            mis_vend    = float(mis_row.get('Discount paid by vendor', 0) or 0)
            mis_store   = normalize_location_string(str(mis_row.get('Store', '')).strip())
            mis_locs    = _loc_fset(mis_store)
            section     = _section_from_weekday(mis_weekday)

            base = {
                'mis_id': mis_id, 'brand': mis_brand, 'weekday': mis_weekday,
                'discount': mis_disc, 'vendor_pct': mis_vend, 'locations': mis_store,
                'start_date': str(mis_row.get('Start date', '')).strip(),
                'end_date':   str(mis_row.get('End date', '')).strip(),
                'section':    section,
            }

            # Method 1 — Full Field Match
            found, partial_diffs = False, []
            for e in sheet_entries:
                if e['brand'] != mis_brand.lower().strip():
                    continue
                wd_ok = True
                if section == 'weekly':
                    mis_d  = {d.strip()[:3] for d in mis_weekday.lower().replace(',', ' ').split() if d.strip()}
                    ent_d  = {d.strip()[:3] for d in e['weekday'].replace(',', ' ').split() if d.strip()}
                    wd_ok  = (mis_d == ent_d) or not mis_d or not ent_d
                disc_ok = abs(e['discount']   - mis_disc) < 0.01
                vend_ok = abs(e['vendor_pct'] - mis_vend) < 0.01
                loc_ok  = resolve_to_store_set(e['loc_set']) == resolve_to_store_set(mis_locs)
                if wd_ok and disc_ok and vend_ok and loc_ok:
                    found = True; break
                diffs = (['Weekday'] if not wd_ok else []) + (['Discount'] if not disc_ok else []) + \
                        (['Vendor%'] if not vend_ok else []) + (['Locations'] if not loc_ok else [])
                if diffs:
                    partial_diffs.append(', '.join(diffs))

            if not found:
                e2 = base.copy()
                e2['status'] = 'PARTIAL_MATCH' if partial_diffs else 'NOT_IN_SHEET'
                if partial_diffs:
                    e2['partial_match_details'] = f"Diff: {partial_diffs[0]}"
                full_match_issues.append(e2)

            # Method 2 — MIS ID Only
            if mis_id not in all_sheet_mis_ids:
                e3 = base.copy()
                e3['status'] = 'ID_NOT_TRACKED'
                id_only_issues.append(e3)

        return jsonify({
            'success': True,
            'results': {'fullMatch': full_match_issues, 'idOnly': id_only_issues},
            'summary': {
                'tab': tab_name,
                'fullMatch_count': len(full_match_issues),
                'idOnly_count':    len(id_only_issues),
            },
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── Audit State ───────────────────────────────────────────────────────────────

@bp.route('/api/audit/save-state', methods=['POST'])
def save_audit_state():
    """Persist audit state to disk (tab-scoped JSON) + session cache. Monolith: line 26604."""
    try:
        data     = request.get_json() or {}
        tab_name = data.get('tab_name', 'default')
        tab_slug = _re.sub(r'[^\w\-]', '_', tab_name)
        _AUDIT_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = _AUDIT_REPORTS_DIR / f'audit_state_{tab_slug}.json'
        with open(out_path, 'w') as f:
            json.dump(data, f, default=str)
        session.set('audit_state', json.dumps(data, default=str))
        session.set('audit_state_saved_at', datetime.now().isoformat())
        return jsonify({'success': True, 'message': f'Audit state saved ({tab_name})'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/audit/load-state', methods=['GET'])
def load_audit_state():
    """Restore audit state from disk (tab-scoped). Falls back to session. Monolith: line 26620."""
    try:
        tab_name  = request.args.get('tab', 'default')
        tab_slug  = _re.sub(r'[^\w\-]', '_', tab_name)
        file_path = _AUDIT_REPORTS_DIR / f'audit_state_{tab_slug}.json'
        if file_path.exists():
            with open(file_path, 'r') as f:
                state = json.load(f)
            saved_at = state.get('saved_at') or str(file_path.stat().st_mtime)
            return jsonify({'success': True, 'state': state, 'saved_at': saved_at})
        raw = session.get('audit_state')
        if raw:
            return jsonify({'success': True, 'state': json.loads(raw),
                            'saved_at': session.get('audit_state_saved_at', 'unknown')})
        return jsonify({'success': False, 'error': 'No saved audit state found'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/audit/export', methods=['POST'])
def export_audit():
    """Export audit results to downloadable CSV file. Monolith: line 26630."""
    import csv, io
    from flask import Response
    try:
        data    = request.get_json() or {}
        results = data.get('results', {})
        rows: list = []
        for section, items in results.items():
            for item in (items if isinstance(items, list) else []):
                row = dict(item)
                row['section'] = section
                rows.append(row)
        if not rows:
            return jsonify({'success': False, 'error': 'No results to export'})
        filename = f"audit_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/review-discrepancy', methods=['POST'])
def review_discrepancy():
    """Acknowledge a mismatch and add a note to session state."""
    try:
        data   = request.get_json() or {}
        mis_id = str(data.get('mis_id', '')).strip()
        note   = str(data.get('note', '')).strip()
        if not mis_id:
            return jsonify({'success': False, 'error': 'No MIS ID provided'})

        notes_key = f'discrepancy_note_{mis_id}'
        session.set(notes_key, note)
        return jsonify({'success': True, 'mis_id': mis_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── Lookup + Validation ───────────────────────────────────────────────────────

@bp.route('/api/mis/lookup-mis-id', methods=['POST'])
def lookup_mis_id():
    """Look up MIS ID in CSV and return full entry data."""
    try:
        data   = request.get_json() or {}
        mis_id = str(data.get('mis_id', '')).strip()
        if not mis_id:
            return jsonify({'success': False, 'error': 'No MIS ID provided'})

        mis_df = session.get_mis_df()
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No MIS CSV loaded'})

        id_col = None
        for candidate in ('ID', 'id', 'MIS ID', 'Mis Id'):
            if candidate in mis_df.columns:
                id_col = candidate
                break

        if not id_col:
            return jsonify({'success': False, 'error': 'Cannot find ID column in CSV'})

        matches = mis_df[mis_df[id_col].astype(str).str.strip() == mis_id]
        if matches.empty:
            return jsonify({'success': False, 'error': f'MIS ID {mis_id} not found in CSV'})

        row = matches.iloc[0]
        return jsonify({
            'success': True,
            'entry': {
                'id':          str(row.get('ID', '')),
                'brand':       str(row.get('Brand', '')),
                'weekday':     str(row.get('Weekday', '')),
                'discount':    str(row.get('Daily Deal Discount', '')),
                'vendor_pct':  str(row.get('Discount paid by vendor', '')),
                'locations':   str(row.get('Store', '')),
                'start_date':  str(row.get('Start date', '')),
                'end_date':    str(row.get('End date', '')),
                'category':    str(row.get('Category', '')),
                'rebate_type': str(row.get('Rebate type', '')),
            },
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/validate-lookup', methods=['POST'])
def validate_lookup():
    """
    V2-LOOKUP: Browser datatable click handler.
    Searches Google Sheet for MIS ID and sends automation or manual validation message.
    """
    try:
        data   = request.get_json() or {}
        mis_id = str(data.get('mis_id', '')).strip()

        if not mis_id:
            return jsonify({'success': False, 'error': 'No MIS ID provided'})

        driver = session.get_browser()
        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        print(f"\n{'='*60}\n[V2-LOOKUP] Click: MIS ID {mis_id}\n{'='*60}")

        google_df  = session.get_google_df()
        bmap       = session.get_mis_bracket_map()
        pmap       = session.get_mis_prefix_map()
        found_data = None

        if google_df is not None and not google_df.empty:
            for _, row in google_df.iterrows():
                for id_col in ('MIS ID', 'ID', 'Mis Id', 'MIS_ID'):
                    if id_col in google_df.columns:
                        sheet_val = str(row.get(id_col, '')).strip()
                        if mis_id in sheet_val or sheet_val == mis_id:
                            loc_raw, exc_raw = resolve_location_columns(row)
                            found_data = {
                                'brand':         str(get_col(row, ['[Brand]', 'Brand'], '', bmap, pmap)).strip(),
                                'linked_brand':  str(get_col(row, ['Linked Brand'], '', bmap, pmap)).strip(),
                                'weekday':       str(get_col(row, ['[Weekday]', 'Weekday', 'Day of Week'], '', bmap, pmap)).strip(),
                                'categories':    str(get_col(row, ['[Category]', 'Categories'], '', bmap, pmap)).strip(),
                                'discount':      str(get_col(row, ['[Daily Deal Discount]', 'Deal Discount Value/Type', 'Deal Discount'], '', bmap, pmap)).strip(),
                                'vendor_contrib': str(get_col(row, ['[Discount paid by vendor]', 'Brand Contribution % (Credit)', 'Vendor Contribution'], '', bmap, pmap)).strip(),
                                'locations':     format_location_display(loc_raw, exc_raw) if loc_raw else 'All Locations',
                            }
                            break
                if found_data:
                    break

        # Import inline to avoid circular — browser.py is in no-touch zone
        from src.automation.browser import inject_mis_validation, send_validation_message

        if found_data:
            send_validation_message(driver, action='automation', mis_id=mis_id, expected_data=found_data)
            return jsonify({'success': True, 'mode': 'automation',
                            'message': f'MIS ID {mis_id} found — automation mode'})
        else:
            send_validation_message(driver, action='manual')
            return jsonify({'success': True, 'mode': 'manual',
                            'message': 'MIS ID not in Google Sheet — manual mode'})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/compare-to-sheet', methods=['POST'])
def compare_to_sheet():
    """
    ValidationEngine Mode B: Compare a live MIS entry against its Google Sheet row.
    User clicks an MIS entry → validate against the Sheet.
    """
    try:
        data = request.get_json() or {}
        # Expect source (MIS live data) and target (expected Sheet data)
        source_data = data.get('source', {})
        target_data = data.get('target', {})

        if not source_data:
            return jsonify({'success': False, 'error': 'No source data provided'})

        source = ValidationRecord(**{k: source_data.get(k, '') for k in ValidationRecord.__dataclass_fields__})
        target = ValidationRecord(**{k: target_data.get(k, '') for k in ValidationRecord.__dataclass_fields__})

        field_results = validation_engine.compare(source, target)
        summary       = validation_engine.summary(field_results)

        return jsonify({
            'success': True,
            'summary': summary.to_dict(),
            'fields':  [
                {
                    'field':    fr.field,
                    'status':   fr.status,
                    'severity': fr.severity,
                    'expected': fr.expected,
                    'actual':   fr.actual,
                    'detail':   fr.detail,
                }
                for fr in field_results
            ],
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})
