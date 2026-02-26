# src/api/mis_matcher.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# ID Matcher tab routes. Thin handlers — business logic in src/core/matcher.py.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import io
import json
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from flask import Blueprint, jsonify, request, send_file

from src.session import session
from src.integrations.google_sheets import (
    extract_spreadsheet_id,
    get_available_tabs,
    fetch_google_sheet_data,
    open_google_sheet_in_browser,
)
from src.utils.csv_resolver import resolve_mis_csv_for_route as resolve_mis_csv
from src.utils.brand_helpers import manage_brand_list
from src.utils.sheet_helpers import detect_header_row, get_col_letter
from src.core.matcher import (
    enhanced_match_mis_ids,
    generate_mis_csv_with_multiday,
)

bp = Blueprint('mis_matcher', __name__)


@bp.route('/api/mis/load-sheet', methods=['POST'])
def load_sheet():
    try:
        data = request.get_json()
        url  = data.get('url', '')
        spreadsheet_id = extract_spreadsheet_id(url)
        if not spreadsheet_id:
            return jsonify({'success': False, 'error': 'Invalid Google Sheet URL'})
        session.set_spreadsheet_id(spreadsheet_id)
        tabs = get_available_tabs(spreadsheet_id)
        if not tabs:
            return jsonify({'success': False, 'error': 'No tabs found in spreadsheet'})
        return jsonify({'success': True, 'tabs': tabs, 'spreadsheet_id': spreadsheet_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/select-tab', methods=['POST'])
def api_mis_select_tab():
    """
    Lightweight route: persist the user's tab selection to session.
    Called by saveTabToSession() in JS whenever mis-tab dropdown changes.
    No browser or sheet interaction — just a session write.
    """
    try:
        data     = request.get_json() or {}
        tab_name = (data.get('tab') or '').strip()
        if not tab_name:
            return jsonify({'success': False, 'error': 'tab required'})
        session.set_mis_current_sheet(tab_name)
        print(f"[SELECT-TAB] Session tab → '{tab_name}'")
        return jsonify({'success': True, 'tab': tab_name})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/init-sheet-page', methods=['POST'])
def api_mis_init_sheet_page():
    """Open a Google Sheet tab in the automated browser. Monolith: line 24372."""
    try:
        data = request.get_json()
        tab_name = data.get('tab')
        spreadsheet_id = session.get_spreadsheet_id()
        if not spreadsheet_id:
            return jsonify({'success': False, 'error': 'No spreadsheet loaded. Load a sheet first.'})
        if not session.is_browser_ready():
            return jsonify({'success': False, 'error': 'Browser not initialized. Click Initialize first.'})
        session.set_mis_current_sheet(tab_name)
        if open_google_sheet_in_browser(spreadsheet_id, tab_name):
            return jsonify({'success': True, 'message': f'Opened tab "{tab_name}"'})
        return jsonify({'success': False, 'error': 'Failed to open sheet in browser'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/generate-csv', methods=['POST'])
def generate_csv():
    try:
        data = request.get_json()
        tab_name = data.get('tab')
        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab selected'})

        spreadsheet_id = session.get_spreadsheet_id()
        # Persist tab so Audit / Matcher routes can recover it without re-selection
        session.set_mis_current_sheet(tab_name)
        sections_data  = fetch_google_sheet_data(tab_name)
        session.set('sections_data_raw', json.dumps({k: v.to_json() for k, v in sections_data.items()}))

        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        results: dict[str, Any] = {}
        total_count = 0

        for section_name in ('weekly', 'monthly', 'sale'):
            df = sections_data.get(section_name, pd.DataFrame())
            if df.empty:
                results[section_name] = {'rows': [], 'summary': {}}
            else:
                rows, summary = generate_mis_csv_with_multiday(
                    df, section_type=section_name,
                    spreadsheet_id=spreadsheet_id or '',
                    bracket_map=bmap, prefix_map=pmap,
                )
                results[section_name] = {'rows': rows, 'summary': summary}
                total_count += len(rows)

        # Persist generated sections in session for download
        # Store as JSON-serialisable (drop non-serialisable types)
        session.set('mis_generated_sections', json.dumps(
            {k: v['rows'] for k, v in results.items()},
            default=str
        ))

        return jsonify({'success': True, 'sections': results, 'total_rows': total_count})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/download-csv')
def download_csv():
    try:
        export_type  = request.args.get('type', 'all')
        raw_sections = session.get('mis_generated_sections')
        if not raw_sections:
            return 'No CSV generated. Click Generate CSV first.', 400

        sections = json.loads(raw_sections)
        final_rows: list[dict] = []

        if export_type == 'all':
            for key in ('weekly', 'monthly', 'sale'):
                final_rows.extend(sections.get(key, []))
        elif export_type in sections:
            final_rows = sections[export_type]
        else:
            return f'Invalid export type: {export_type}', 400

        if not final_rows:
            return 'No data for selected section.', 400

        df = pd.DataFrame(final_rows)
        internal_cols = ['GOOGLE_ROWS', 'MULTI_DAY_FLAG', 'WEEKDAY_SORT_KEY', 'NOTES',
                         'SPLIT_GROUP_ID', 'ROW_UI_CLASS', 'DISPLAY_CATEGORY',
                         'DISPLAY_STORE', 'UI_SPECIAL_NOTES', 'UI_DEAL_INFO', 'UI_REBATE_DISPLAY']
        df = df.drop(columns=internal_cols, errors='ignore')

        column_order = [
            'ID', 'Weekday', 'Store', 'Brand', 'Linked Brand (if applicable)',
            'Category', 'Daily Deal Discount', 'Rebate type',
            'Discount paid by vendor', 'Rebate After Wholesale Discount?',
            'Include clearance items?', 'Specialty Discount (non-daily deal)?',
            'Start date', 'End date', 'Minimum Weight', 'Maximum Weight', 'Actions',
        ]
        for col in column_order:
            if col not in df.columns:
                df[col] = ''
        df = df[[c for c in column_order if c in df.columns]]

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename  = f'MIS_Deals_{export_type.upper()}_{timestamp}.csv'

        buf = io.StringIO()
        df.to_csv(buf, index=False)
        buf.seek(0)
        return send_file(
            io.BytesIO(buf.getvalue().encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        traceback.print_exc()
        return str(e), 500


_MIS_REPORTS_DIR = Path(__file__).resolve().parent.parent.parent / 'reports' / 'MIS_CSV_REPORTS'


@bp.route('/api/mis/pull-csv', methods=['POST'])
def pull_csv():
    """Pull MIS CSV in background via browser automation. Monolith: line 25375."""
    import time as _time
    try:
        from src.automation.browser import execute_in_background
        from src.automation.mis_entry import pull_mis_csv_report_background
        data         = request.get_json() or {}
        gui_username = data.get('mis_username', '').strip()
        gui_password = data.get('mis_password', '').strip()
        _MIS_REPORTS_DIR.mkdir(parents=True, exist_ok=True)

        def pull_operation(driver):
            return pull_mis_csv_report_background(driver)

        result = execute_in_background('mis', pull_operation,
                                       gui_username=gui_username,
                                       gui_password=gui_password)
        if result['success']:
            success, path, filename = result['result']
            if success:
                session.set('mis_csv_filepath', path)
                session.set('mis_csv_filename', filename)
                print(f"[CSV-PULL] Stored in session: {filename}")
                return jsonify({'success': True, 'path': path, 'filename': filename})
            else:
                return jsonify({'success': False, 'error': path})
        else:
            return jsonify({'success': False, 'error': result.get('error', 'Unknown error')})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/match', methods=['POST'])
def match():
    """
    ID Matcher: Match Google Sheet rows to MIS ID candidates.
    Accepts either uploaded CSV file or previously pulled CSV from session.
    """
    try:
        tab_name = request.form.get('tab')
        csv_file = request.files.get('csv')

        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        # ── Load MIS CSV ──────────────────────────────────────────────────────
        mis_df = resolve_mis_csv(csv_file_obj=csv_file, session=session)
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No CSV available. Pull CSV or upload manually.'})

        session.set_mis_df(mis_df)

        # ── Update brand list ─────────────────────────────────────────────────
        manage_brand_list(mis_df)

        # ── Fetch Google Sheet sections ───────────────────────────────────────
        sections_data = fetch_google_sheet_data(tab_name)

        weekly_df  = sections_data.get('weekly',  pd.DataFrame()).copy()
        monthly_df = sections_data.get('monthly', pd.DataFrame()).copy()
        sale_df    = sections_data.get('sale',    pd.DataFrame()).copy()

        for df, label in ((weekly_df, 'weekly'), (monthly_df, 'monthly'), (sale_df, 'sale')):
            if not df.empty:
                df['_section'] = label

        combined_df = pd.concat([weekly_df, monthly_df, sale_df], ignore_index=True)
        session.set_google_df(combined_df)

        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()
        tab  = session.get_mis_current_sheet() or tab_name

        all_matches: list[dict] = []
        for section_name in ('weekly', 'monthly', 'sale'):
            df = sections_data.get(section_name, pd.DataFrame())
            if df.empty:
                continue
            section_matches = enhanced_match_mis_ids(
                df, mis_df,
                section_type=section_name,
                bracket_map=bmap,
                prefix_map=pmap,
                tab_name=tab,
            )
            all_matches.extend(section_matches)

        print(f"[MATCHER] Total matches: {len(all_matches)}")
        return jsonify({'success': True, 'matches': all_matches, 'total': len(all_matches)})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/apply-matches', methods=['POST'])
def apply_matches():
    """Write confirmed MIS IDs back to the Google Sheet (section-aware tags)."""
    try:
        data    = request.get_json()
        matches = data.get('matches', {})
        if not matches:
            return jsonify({'success': False, 'error': 'No matches provided'})

        service        = session.get_sheets_service()
        spreadsheet_id = session.get_spreadsheet_id()
        sheet_name     = session.get_mis_current_sheet()

        if not service or not spreadsheet_id or not sheet_name:
            return jsonify({'success': False, 'error': 'Not configured. Open a Google Sheet tab first.'})

        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A1:BZ20"
        ).execute()
        values = result.get('values', [])
        if not values:
            return jsonify({'success': False, 'error': 'Sheet is empty'})

        header_row_idx = detect_header_row(values)
        headers = values[header_row_idx]

        mis_id_col: int | None = None
        for idx, header in enumerate(headers):
            if 'MIS ID' in str(header) or header == 'ID':
                mis_id_col = idx
                break

        if mis_id_col is None:
            return jsonify({'success': False, 'error': 'MIS ID column not found'})

        target_col_letter = get_col_letter(mis_id_col)
        row_numbers = [int(r) for r in matches.keys()]

        data_to_update = []
        for row_num, mis_id_value in matches.items():
            data_to_update.append({
                'range':  f"'{sheet_name}'!{target_col_letter}{row_num}",
                'values': [[str(mis_id_value)]],
            })

        if data_to_update:
            service.spreadsheets().values().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={'valueInputOption': 'RAW', 'data': data_to_update}
            ).execute()

        print(f"[APPLY-MATCHES] Applied {len(data_to_update)} MIS IDs to sheet")
        return jsonify({'success': True, 'updated': len(data_to_update)})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/apply-blaze-titles', methods=['POST'])
def apply_blaze_titles():
    """Write standardized Blaze discount titles to Google Sheet."""
    try:
        data    = request.get_json()
        matches = data.get('matches', {})
        if not matches:
            return jsonify({'success': False, 'error': 'No matches provided'})

        service        = session.get_sheets_service()
        spreadsheet_id = session.get_spreadsheet_id()
        sheet_name     = session.get_mis_current_sheet()

        if not service or not spreadsheet_id or not sheet_name:
            return jsonify({'success': False, 'error': 'Not configured'})

        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A1:BZ20"
        ).execute()
        values = result.get('values', [])
        if not values:
            return jsonify({'success': False, 'error': 'Sheet is empty'})

        header_row_idx = detect_header_row(values)
        headers = values[header_row_idx]

        blaze_col: int | None = None
        for idx, header in enumerate(headers):
            h_lower = str(header).strip().lower()
            if 'blaze' in h_lower and ('discount' in h_lower or 'title' in h_lower):
                blaze_col = idx
                break
        if blaze_col is None:
            return jsonify({'success': False, 'error': 'Blaze Discount Title column not found'})

        target_col_letter = get_col_letter(blaze_col)
        data_to_update = []
        for row_num, title_value in matches.items():
            data_to_update.append({
                'range':  f"'{sheet_name}'!{target_col_letter}{row_num}",
                'values': [[str(title_value)]],
            })

        if data_to_update:
            service.spreadsheets().values().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={'valueInputOption': 'RAW', 'data': data_to_update}
            ).execute()

        return jsonify({'success': True, 'updated': len(data_to_update)})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/apply-split-id', methods=['POST'])
def apply_split_id():
    """Write tagged MIS ID (W1/W2/WP etc.) to a Google Sheet row."""
    try:
        from src.utils.sheet_helpers import strip_mis_id_tag
        from src.utils.brand_helpers import update_tagged_mis_cell

        data       = request.get_json()
        google_row = data.get('google_row')
        new_mis_id = str(data.get('new_mis_id', '')).strip()
        tag        = data.get('tag', 'w1').lower()
        append     = data.get('append', True)

        new_mis_id = strip_mis_id_tag(new_mis_id)

        if not google_row or not new_mis_id:
            return jsonify({'success': False, 'error': 'Missing google_row or new_mis_id'})
        if not new_mis_id.isdigit():
            return jsonify({'success': False, 'error': f'Invalid MIS ID format: {new_mis_id}'})

        service        = session.get_sheets_service()
        spreadsheet_id = session.get_spreadsheet_id()
        sheet_name     = session.get_mis_current_sheet()

        if not service or not spreadsheet_id or not sheet_name:
            return jsonify({'success': False, 'error': 'Not configured'})

        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A1:BZ20"
        ).execute()
        values = result.get('values', [])
        if not values:
            return jsonify({'success': False, 'error': 'Sheet is empty'})

        header_row_idx = detect_header_row(values)
        headers = values[header_row_idx]

        mis_id_col: int | None = None
        for idx, header in enumerate(headers):
            if 'MIS ID' in str(header) or header == 'ID':
                mis_id_col = idx
                break

        if mis_id_col is None:
            return jsonify({'success': False, 'error': 'MIS ID column not found'})

        col_letter = get_col_letter(mis_id_col)

        # Read current cell value
        current_result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!{col_letter}{google_row}"
        ).execute()
        current_vals   = current_result.get('values', [[]])
        current_val    = current_vals[0][0] if current_vals and current_vals[0] else ''

        # Build updated cell value
        tag_upper  = tag.upper()
        new_entry  = f"{tag_upper}: {new_mis_id}"

        if append and current_val:
            updated_val = f"{current_val}\n{new_entry}"
        else:
            updated_val = new_entry

        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!{col_letter}{google_row}",
            valueInputOption='RAW',
            body={'values': [[updated_val]]},
        ).execute()

        return jsonify({'success': True, 'updated_value': updated_val})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/search-brand', methods=['POST'])
def search_brand():
    """Search MIS table for a brand via Selenium. Monolith: line 27733."""
    import time as _time
    try:
        from src.automation.browser import ensure_mis_ready
        from src.api.profiles import load_profile_credentials
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.keys import Keys

        data   = request.get_json() or {}
        brand  = data.get('brand', '').strip()
        driver = session.get_browser()
        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized. Click Initialize first.'})

        creds    = load_profile_credentials(session.get_active_handle()) or {}
        mis_user = creds.get('mis_username', '')
        mis_pass = creds.get('mis_password', '')
        try:
            ensure_mis_ready(driver, mis_user, mis_pass)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})

        # Close any open modal that might block the search input
        try:
            for btn in driver.find_elements(By.CSS_SELECTOR, "button.close[data-dismiss='modal']"):
                if btn.is_displayed():
                    btn.click()
                    _time.sleep(0.3)
                    break
        except Exception:
            pass

        try:
            search_input = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='search']"))
            )
            search_input.click()
            search_input.send_keys(Keys.CONTROL + 'a')
            search_input.send_keys(Keys.DELETE)
            search_input.send_keys(brand)
            search_input.send_keys(Keys.RETURN)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'success': False, 'error': f'Search failed: {str(e)}'})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})
