# src/api/mis_automation.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# MIS Automation routes: browser init, deal creation, end-date updates,
# validation injection, and pre-flight validation.
# Selenium ops live in src/automation/mis_entry.py (no-touch zone).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import os
import sys
import traceback

from flask import Blueprint, jsonify, request

from src.session import session

bp = Blueprint('mis_automation', __name__)


# ── System ────────────────────────────────────────────────────────────────────

@bp.route('/api/restart', methods=['POST'])
def restart():
    """Hard restart via os.execv."""
    try:
        print("\n" + "="*70 + "\n[RESTART] Restarting application...\n" + "="*70 + "\n")
        os.execv(sys.executable, [sys.executable] + sys.argv)
        return jsonify({'success': True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/browser-status')
def browser_status():
    """Return current browser readiness."""
    return jsonify({
        'ready':    session.is_browser_ready(),
        'instance': session.get_browser() is not None,
    })


@bp.route('/api/get-settings-dropdowns', methods=['GET'])
def get_settings_dropdowns():
    """Fetch dropdown options from Settings tab for Enhanced Create Popup."""
    try:
        from src.integrations.google_sheets import load_settings_dropdown_data

        spreadsheet_id = session.get_spreadsheet_id()
        if not spreadsheet_id:
            return jsonify({'success': False, 'error': 'No spreadsheet loaded. Select a Google Sheet first.'})

        service = session.get_sheets_service()
        if not service:
            return jsonify({'success': False, 'error': 'Sheets service not authenticated.'})

        data = load_settings_dropdown_data(spreadsheet_id, service)
        return jsonify({
            'success':         True,
            'stores':          data.get('stores', []),
            'categories':      data.get('categories', []),
            'brand_linked_map': data.get('brand_linked_map', {}),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/init-all', methods=['POST'])
def init_all():
    """Initialize browser, MIS login, and Blaze login in sequence."""
    try:
        from src.automation.browser import init_browser, mis_login, robust_login
        from src.integrations.blaze_api import load_stored_token, validate_token

        data       = request.get_json() or {}
        mis_creds  = data.get('mis', {})
        blaze_creds = data.get('blaze', {})

        session.set_mis_credentials(mis_creds)
        session.set_blaze_credentials(blaze_creds)

        driver = session.get_browser()

        # 1. Browser
        if not session.is_browser_ready():
            driver = init_browser()
            if not driver:
                return jsonify({'success': False, 'error': 'Failed to initialize browser'})
            session.set_browser(driver)
            session.set_browser_ready(True)

        # 2. MIS Login
        mis_success = False
        if mis_creds.get('username') and mis_creds.get('password'):
            mis_success = mis_login(driver, mis_creds['username'], mis_creds['password'], new_tab=True)

        # 3. Blaze Login
        blaze_success = False
        if blaze_creds.get('email') and blaze_creds.get('password'):
            stored_token = load_stored_token()
            if validate_token(stored_token):
                print("[INIT] Existing token valid. Skipping sniffer.")
                robust_login(blaze_creds['email'], blaze_creds['password'])
                session.set_blaze_token(stored_token)
                blaze_success = True
            else:
                login_status = robust_login(blaze_creds['email'], blaze_creds['password'])
                blaze_success = bool(login_status)

        return jsonify({
            'success':        True,
            'browser_ready':  session.is_browser_ready(),
            'mis_login':      mis_success,
            'blaze_login':    blaze_success,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── Deal Automation ───────────────────────────────────────────────────────────

@bp.route('/api/mis/create-deal', methods=['POST'])
def create_deal():
    """Automation: Fill MIS modal via Selenium. Builds ValidationRecord for pre-flight."""
    try:
        from src.automation.mis_entry import fill_deal_form
        from src.core.validation_engine import engine as ve, ValidationRecord

        data   = request.get_json() or {}
        driver = session.get_browser()

        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        result = fill_deal_form(driver, data)
        if not result.get('success'):
            return jsonify(result)

        # Pre-flight: validate entered vs expected data
        if data.get('expected'):
            source = ValidationRecord(**{
                k: str(result.get('filled', {}).get(k, ''))
                for k in ValidationRecord.__dataclass_fields__
            })
            target = ValidationRecord(**{
                k: str(data['expected'].get(k, ''))
                for k in ValidationRecord.__dataclass_fields__
            })
            field_results = ve.compare(source, target)
            summary       = ve.summary(field_results)
            result['validation'] = summary.to_dict()

        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/automate-create-deal', methods=['POST'])
def automate_create_deal():
    """Full automation path for Up-Down Planning and ID Matcher create buttons."""
    try:
        from src.automation.mis_entry import automate_full_create

        data   = request.get_json() or {}
        driver = session.get_browser()

        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        result = automate_full_create(driver, data, session=session)
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/update-end-date', methods=['POST'])
def update_end_date():
    """Automation: Update an existing MIS entry's end date via Selenium."""
    try:
        from src.automation.mis_entry import update_mis_end_date

        data   = request.get_json() or {}
        driver = session.get_browser()

        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        result = update_mis_end_date(driver, data)
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/automate-end-date', methods=['POST'])
def automate_end_date():
    """Full end-date automation sequence."""
    try:
        from src.automation.mis_entry import automate_full_end_date

        data   = request.get_json() or {}
        driver = session.get_browser()

        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        result = automate_full_end_date(driver, data, session=session)
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/inject-validation', methods=['POST'])
def inject_validation():
    """Inject MIS validation system into the current browser page."""
    try:
        from src.automation.browser import inject_mis_validation

        driver = session.get_browser()
        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        # Switch to MIS tab
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if 'mymis.net' in driver.current_url or 'mis' in driver.current_url.lower():
                break

        inject_mis_validation(driver, expected_data=None)
        return jsonify({'success': True, 'message': 'Validation system injected. Modal monitoring active.'})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/mis/open-sheet-row', methods=['POST'])
def open_sheet_row():
    """Open a specific Google Sheet row in the browser."""
    try:
        from src.automation.browser import open_google_sheet_in_browser

        data           = request.get_json() or {}
        spreadsheet_id = session.get_spreadsheet_id()
        sheet_name     = data.get('sheet_name') or session.get_mis_current_sheet()
        row_num        = data.get('row')

        if not spreadsheet_id or not sheet_name:
            return jsonify({'success': False, 'error': 'No spreadsheet/sheet configured'})

        driver = session.get_browser()
        if not driver:
            return jsonify({'success': False, 'error': 'Browser not initialized'})

        success = open_google_sheet_in_browser(spreadsheet_id, sheet_name, row_num)
        return jsonify({'success': success})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# ── Utilities ─────────────────────────────────────────────────────────────────

@bp.route('/api/mis/generate-newsletter', methods=['POST'])
def generate_newsletter():
    """Generate Newsletter files (Excel + optionally Blaze sync)."""
    try:
        from src.integrations.google_sheets import fetch_google_sheet_data

        data     = request.get_json() or {}
        tab_name = data.get('tab', '')
        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        # Defer heavy Excel generation to Step 7 (frontend extraction)
        return jsonify({'success': False, 'error': 'Newsletter generation implemented in Step 7'}), 501

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)})


# NOTE: /api/tax-rates and /api/save-tax-rates are owned by src/api/blaze.py.
# Removed from here to prevent duplicate URL rule conflicts.
