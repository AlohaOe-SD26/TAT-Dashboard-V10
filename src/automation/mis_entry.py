# src/automation/mis_entry.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# MIS Selenium form-filling automation.
# Provides: fill_deal_form, automate_full_create, update_mis_end_date,
#           automate_full_end_date, ensure_mis_ready, strip_mis_id_tag
#
# NOTE: No-touch-zone imports (browser.py, blaze_sync.py) are kept intact.
# All Selenium ops live here; no Selenium in route files.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import time
import traceback
from datetime import datetime, timedelta
from typing import Any

MIS_URL          = 'https://mis.theartisttree.com/daily-discount'
MIS_URL_FRAGMENT = 'mis.theartisttree.com'

MASTER_STORE_LIST = [
    'Beverly', 'Davis', 'Dixon', 'El Sobrante', 'Fresno', 'Fresno Shaw',
    'Hawthorne', 'Koreatown', 'Laguna Woods', 'Oxnard', 'Riverside', 'West Hollywood',
]


# ── Utility helpers ───────────────────────────────────────────────────────────

def strip_mis_id_tag(tagged_id: str) -> str:
    """
    Strip any prefix tag from a MIS ID string.
    'W1: 12345' → '12345',  'GAP: 67890' → '67890',  '12345' → '12345'
    """
    if not tagged_id:
        return ''
    tagged_id = str(tagged_id).strip()
    return tagged_id.split(':', 1)[1].strip() if ':' in tagged_id else tagged_id


def _log(msg: str, level: str = 'INFO') -> None:
    ts = time.strftime('%H:%M:%S')
    print(f'[{ts}] [{level}] {msg}')


def _load_saved_creds() -> dict:
    """Load MIS/Blaze credentials from the active profile blaze_config."""
    try:
        from src.api.profiles import load_profile_credentials, get_last_used_profile
        handle = get_last_used_profile()
        return load_profile_credentials(handle)
    except Exception:
        return {}


# ── Selenium primitives ───────────────────────────────────────────────────────

def _click_backdrop(driver: Any) -> None:
    """Close any open Select2 dropdown by clicking a neutral element."""
    try:
        el = driver.find_element('css selector', 'h4.modal-title, .modal-header, .modal-body h5')
        el.click()
        time.sleep(0.10)
    except Exception:
        try:
            from selenium.webdriver.common.keys import Keys
            from selenium.webdriver.common.action_chains import ActionChains
            ActionChains(driver).send_keys(Keys.ESCAPE).perform()
            time.sleep(0.08)
        except Exception:
            pass


def _fast_type(driver: Any, element: Any, text: str, field_name: str = 'field') -> bool:
    """
    Fast text input: JS injection → send_keys → char-by-char fallback.
    Returns True on success.
    """
    text = str(text)
    # Method 1: JS
    try:
        driver.execute_script("""
            var el = arguments[0]; var txt = arguments[1];
            el.value = txt;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('keyup',  { bubbles: true }));
        """, element, text)
        time.sleep(0.15)
        return True
    except Exception:
        pass
    # Method 2: send_keys
    try:
        element.send_keys(text)
        time.sleep(0.15)
        return True
    except Exception:
        pass
    # Method 3: char-by-char
    try:
        for ch in text:
            element.send_keys(ch)
            time.sleep(0.015)
        time.sleep(0.15)
        return True
    except Exception as e:
        _log(f'[{field_name}] All type methods failed: {e}', 'ERROR')
        return False


def _build_xpath_contains(text: str) -> str:
    """Build XPath contains() expression, handling apostrophes via concat()."""
    if "'" in text:
        parts = text.split("'")
        concat_parts = []
        for i, part in enumerate(parts):
            if part:
                concat_parts.append(f"'{part}'")
            if i < len(parts) - 1:
                concat_parts.append('"\'"')
        return f"concat({', '.join(concat_parts)})"
    return f"'{text}'"


def _select2_pick(driver: Any, label_text: str, value: str, field_name: str) -> bool:
    """
    Fill a Select2 dropdown: open → type to filter (if searchable) → click option.
    """
    if not value:
        _log(f'Skipping {field_name} — no value', 'SKIP')
        return True

    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.keys import Keys

    FIELD_ID_MAP = {
        'Brand': 'brand_id',
        'Linked Brand': 'linked_brand_id',
        'Rebate Type': 'daily_discount_type_id',
    }
    select_id = FIELD_ID_MAP.get(field_name, field_name.lower().replace(' ', '_'))

    try:
        ActionChains(driver).send_keys(Keys.ESCAPE).perform(); time.sleep(0.1)
        _click_backdrop(driver); time.sleep(0.15)

        container = None
        for method, css in [
            ('select_id', f"select#{select_id} + .select2-container"),
            ('aria',      f".select2-container[aria-labelledby*='{select_id}']"),
            ('known_id',  f"#{f'select2-{select_id}-container'}"),
        ]:
            try:
                container = driver.find_element(By.CSS_SELECTOR, css)
                break
            except Exception:
                pass

        if not container:
            _xpath = f"//label[contains(text(), {_build_xpath_contains(label_text)})]/following::span[contains(@class,'select2-container')][1]"
            try:
                container = driver.find_element(By.XPATH, _xpath)
            except Exception:
                _log(f'[{field_name}] Cannot find Select2 container', 'ERROR')
                return False

        ActionChains(driver).move_to_element(container).click().perform()
        time.sleep(0.25)

        # Type to filter if search input is visible
        search_inputs = driver.find_elements(By.CSS_SELECTOR, '.select2-dropdown .select2-search__field')
        for si in search_inputs:
            if si.is_displayed():
                ActionChains(driver).move_to_element(si).click().perform()
                time.sleep(0.1)
                _fast_type(driver, si, str(value), field_name)
                break

        # Click matching option
        val_xpath = _build_xpath_contains(str(value))
        for xpath in [
            f"//li[contains(@class,'select2-results__option') and normalize-space(text())={val_xpath}]",
            f"//li[contains(@class,'select2-results__option') and contains(text(),{val_xpath})]",
        ]:
            try:
                opt = WebDriverWait(driver, 2).until(EC.element_to_be_clickable((By.XPATH, xpath)))
                opt.click()
                _log(f'[{field_name}] Selected: {value}')
                time.sleep(0.2)
                _click_backdrop(driver)
                return True
            except Exception:
                pass

        _log(f'[{field_name}] Option not found: {value}', 'WARN')
        return False

    except Exception as e:
        _log(f'[{field_name}] select2_pick error: {e}', 'ERROR')
        return False


def _fill_date(driver: Any, field_id: str, date_str: str, label: str) -> bool:
    """Fill a date input by field ID."""
    from selenium.webdriver.common.by import By
    try:
        el = driver.find_element(By.ID, field_id)
        driver.execute_script("arguments[0].value = '';", el)
        el.click(); time.sleep(0.1)
        _fast_type(driver, el, date_str, label)
        _log(f'[{label}] Set: {date_str}')
        return True
    except Exception as e:
        _log(f'[{label}] date fill error: {e}', 'WARN')
        return False


def _fill_numeric(driver: Any, field_id: str, value: str, label: str) -> bool:
    """Fill a numeric input by field ID."""
    from selenium.webdriver.common.by import By
    try:
        el = driver.find_element(By.ID, field_id)
        driver.execute_script("arguments[0].value = '';", el)
        _fast_type(driver, el, str(value).replace('%', '').strip(), label)
        _log(f'[{label}] Set: {value}')
        return True
    except Exception as e:
        _log(f'[{label}] numeric fill error: {e}', 'WARN')
        return False


def _select_stores(driver: Any, locations_str: str) -> bool:
    """
    Handle the multi-select store list: 'All Locations', individual stores,
    or 'All Locations Except: X, Y'.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    loc = str(locations_str).strip()
    _log(f'[Stores] Resolving: {loc}')

    if not loc or loc.lower() in ('all', 'all locations', ''):
        target_stores = MASTER_STORE_LIST[:]
    elif 'except' in loc.lower():
        import re
        except_match = re.search(r'except[:\s]*(.*)', loc, re.IGNORECASE)
        if except_match:
            excluded = {s.strip().lower() for s in except_match.group(1).split(',')}
            target_stores = [s for s in MASTER_STORE_LIST if s.lower() not in excluded]
        else:
            target_stores = MASTER_STORE_LIST[:]
    else:
        target_stores = [s.strip() for s in loc.split(',') if s.strip()]

    _log(f'[Stores] Targeting {len(target_stores)} stores: {target_stores}')

    try:
        # Deselect all first (click header "All" then deselect)
        all_cb_xpath = "//label[normalize-space()='All']/input[@type='checkbox']"
        try:
            all_cb = driver.find_element(By.XPATH, all_cb_xpath)
            if all_cb.is_selected():
                all_cb.click(); time.sleep(0.2)
        except Exception:
            pass

        # Select target stores
        for store in target_stores:
            xpath = f"//label[normalize-space()='{store}']/input[@type='checkbox']"
            try:
                cb = WebDriverWait(driver, 2).until(EC.presence_of_element_located((By.XPATH, xpath)))
                if not cb.is_selected():
                    cb.click(); time.sleep(0.1)
                _log(f'  ✓ {store}')
            except Exception:
                _log(f'  ✗ {store} — not found in modal', 'WARN')

        return True

    except Exception as e:
        _log(f'[Stores] Error: {e}', 'ERROR')
        return False


# ── Session management ────────────────────────────────────────────────────────

def ensure_mis_ready(driver: Any, username: str = '', password: str = '') -> bool:
    """
    Ensure MIS tab is open and logged in.
    Finds or creates tab, refreshes, checks login state, auto-logs-in if needed.
    Raises Exception with user-friendly message on unrecoverable failure.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait

    _log('Ensuring MIS session is ready...')

    mis_tab = None
    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        if MIS_URL_FRAGMENT in driver.current_url:
            mis_tab = handle
            _log('Found existing MIS tab')
            break

    if not mis_tab:
        _log('No MIS tab found — opening new tab')
        driver.execute_script(f"window.open('{MIS_URL}', '_blank');")
        time.sleep(2)
        driver.switch_to.window(driver.window_handles[-1])

    driver.refresh()
    time.sleep(2)

    try:
        WebDriverWait(driver, 10).until(
            lambda d: d.find_elements(By.NAME, 'email') or d.find_elements(By.ID, 'daily-discount')
        )
    except Exception:
        time.sleep(3)

    logged_out = bool(driver.find_elements(By.NAME, 'email'))
    logged_in  = bool(driver.find_elements(By.ID, 'daily-discount'))

    if logged_in:
        _log('✅ MIS already logged in')
        return True

    if logged_out:
        _log('Session expired — logging in')
        un = username.strip() or _load_saved_creds().get('mis_username', '')
        pw = password.strip() or _load_saved_creds().get('mis_password', '')

        if not un or not pw:
            raise Exception(
                '🔒 MIS Login Required\n\n'
                'MIS session expired and no credentials are saved.\n'
                'Enter credentials in Setup tab and try again.'
            )

        try:
            email_el = driver.find_element(By.NAME, 'email')
            email_el.clear(); email_el.send_keys(un)
            pass_el  = driver.find_element(By.NAME, 'password')
            pass_el.clear(); pass_el.send_keys(pw)
            driver.find_element(By.CSS_SELECTOR, 'button[type=submit], input[type=submit]').click()
            time.sleep(3)
        except Exception as e:
            raise Exception(f'MIS auto-login failed: {e}')

    _log('✅ MIS ready')
    return True


# ── fill_deal_form ────────────────────────────────────────────────────────────

def fill_deal_form(driver: Any, payload: dict) -> dict:
    """
    Selenium: Click Add New → fill all modal fields from payload.
    Does NOT click Save — user reviews first.

    payload keys: brand, linked_brand, weekday, discount, vendor_contrib,
                  locations, categories, start_date, end_date, rebate_type,
                  after_wholesale (optional), sheet_data (dict, alias keys accepted)
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    try:
        from src.session import session
        session.set_automation_in_progress(True)

        # Flatten sheet_data alias
        sd = payload.get('sheet_data', {})
        brand          = sd.get('brand')          or payload.get('brand', '')
        linked_brand   = sd.get('linked_brand')   or payload.get('linked_brand', '')
        weekday        = sd.get('weekday')         or payload.get('weekday', '')
        discount       = sd.get('discount')        or payload.get('discount', '')
        vendor_contrib = sd.get('vendor_contrib')  or payload.get('vendor_contrib', '')
        locations      = sd.get('locations')       or payload.get('locations', 'All Locations')
        categories     = sd.get('categories')      or payload.get('categories', '')
        start_date     = payload.get('start_date', '')
        end_date       = payload.get('end_date', '')
        rebate_type    = sd.get('rebate_type')     or payload.get('rebate_type', '')
        after_wholesale = sd.get('after_wholesale') or payload.get('after_wholesale', '')

        print(f"\n{'='*60}\n[MIS CREATE] Brand={brand} | {start_date}→{end_date}\n{'='*60}")

        # Ensure MIS session
        creds = _load_saved_creds()
        ensure_mis_ready(driver, creds.get('mis_username', ''), creds.get('mis_password', ''))

        # Click Add New
        add_btn = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button.btn-add-dialog'))
        )
        add_btn.click(); time.sleep(2)

        # Wait for modal
        WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, 'discount_rate')))
        _log('Modal opened')

        warnings = []

        # Fill fields
        if brand:
            ok = _select2_pick(driver, 'Brand', brand, 'Brand')
            if not ok: warnings.append(f'Brand "{brand}" not found')

        if linked_brand:
            _select2_pick(driver, 'Linked Brand', linked_brand, 'Linked Brand')

        if rebate_type:
            _select2_pick(driver, 'Rebate Type', rebate_type, 'Rebate Type')

        if discount:
            _fill_numeric(driver, 'discount_rate', discount, 'Discount')

        if vendor_contrib:
            _fill_numeric(driver, 'vendor_rebate', vendor_contrib, 'Vendor Rebate')

        if after_wholesale:
            _fill_numeric(driver, 'after_wholesale', after_wholesale, 'After Wholesale')

        if start_date:
            _fill_date(driver, 'start_date', start_date, 'Start Date')

        if end_date:
            _fill_date(driver, 'end_date', end_date, 'End Date')

        if weekday:
            # Weekday is a Select2 multi-select
            for day in [d.strip() for d in weekday.split(',')]:
                _select2_pick(driver, 'Day of Week', day, f'Weekday({day})')

        if locations:
            _select_stores(driver, locations)

        if categories:
            _select2_pick(driver, 'Category', categories, 'Category')

        _log('✅ All fields filled. Modal open for user review.')
        session.set_automation_in_progress(False)

        return {
            'success':  True,
            'warnings': warnings,
            'filled': {
                'brand': brand, 'linked_brand': linked_brand, 'weekday': weekday,
                'discount': discount, 'vendor_contrib': vendor_contrib,
                'locations': locations, 'categories': categories,
                'start_date': start_date, 'end_date': end_date,
                'rebate_type': rebate_type,
            },
        }

    except Exception as e:
        traceback.print_exc()
        try:
            from src.session import session
            session.set_automation_in_progress(False)
        except Exception:
            pass
        return {'success': False, 'error': str(e)}


# ── automate_full_create ──────────────────────────────────────────────────────

def automate_full_create(driver: Any, payload: dict, session: Any = None) -> dict:
    """
    Full automated deal creation: fill + trigger validation banner.
    Delegates field-filling to fill_deal_form().
    """
    result = fill_deal_form(driver, payload)
    if not result.get('success'):
        return result

    # Inject validation banner JS (non-fatal if it fails)
    try:
        from src.automation.browser import inject_mis_validation, send_validation_message
        expected = result.get('filled', {})
        send_validation_message(driver, action='automation', expected_data=expected)
        result['validation_injected'] = True
    except Exception as e:
        _log(f'Banner injection failed (non-fatal): {e}', 'WARN')
        result['validation_injected'] = False

    return result


# ── update_mis_end_date ───────────────────────────────────────────────────────

def update_mis_end_date(driver: Any, payload: dict) -> dict:
    """
    Expand-and-Attack end date update.
    Filters MIS table by ID → expands row → clicks Edit → updates end date.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys

    try:
        mis_id   = strip_mis_id_tag(str(payload.get('mis_id', '')).strip())
        new_date = str(payload.get('new_date', '')).strip()

        if not mis_id or not mis_id.isdigit():
            return {'success': False, 'error': f'Invalid MIS ID: {payload.get("mis_id")}'}
        if not new_date:
            return {'success': False, 'error': 'No new date provided'}

        creds = _load_saved_creds()
        ensure_mis_ready(driver, creds.get('mis_username', ''), creds.get('mis_password', ''))

        _log(f'Expand & Attack: MIS ID {mis_id} → {new_date}')

        # Close any open modals
        for btn in driver.find_elements(By.CSS_SELECTOR, "button.close[data-dismiss='modal'], .btn-close"):
            if btn.is_displayed():
                btn.click(); time.sleep(0.3); break

        # Step 1: Filter search
        search = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='search']"))
        )
        search.click()
        search.send_keys(Keys.CONTROL + 'a')
        search.send_keys(Keys.DELETE)
        search.send_keys(mis_id)
        time.sleep(1.5)

        # Step 2: Find target row
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '#daily-discount tbody tr'))
        )
        rows = driver.find_elements(By.CSS_SELECTOR, '#daily-discount tbody tr:not(.child)')
        target_row = next((r for r in rows if mis_id in r.text), None)

        if not target_row:
            return {'success': False, 'error': f'MIS ID {mis_id} not found in table'}

        # Step 3: Expand row (click first cell to reveal child row with Edit button)
        first_cell = target_row.find_element(By.CSS_SELECTOR, 'td:first-child')
        first_cell.click(); time.sleep(1.2)

        # Step 4: Find Edit button in child row
        edit_btn = WebDriverWait(driver, 4).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'a.btn-table-dialog'))
        )
        edit_btn.click(); time.sleep(1.5)

        # Step 5: Wait for edit modal
        WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, 'discount_rate')))

        # Step 6: Update end date
        ok = _fill_date(driver, 'end_date', new_date, 'End Date')
        if not ok:
            return {'success': False, 'error': 'Could not set end date in modal'}

        _log(f'✅ End date set to {new_date} for MIS ID {mis_id}')
        return {'success': True, 'mis_id': mis_id, 'new_date': new_date,
                'message': 'End date filled. Modal open — click Save to confirm.'}

    except Exception as e:
        traceback.print_exc()
        return {'success': False, 'error': str(e)}


# ── automate_full_end_date ────────────────────────────────────────────────────

def automate_full_end_date(driver: Any, payload: dict, session: Any = None) -> dict:
    """Full end-date automation including ValidationEngine banner injection."""
    result = update_mis_end_date(driver, payload)
    if not result.get('success'):
        return result

    try:
        from src.automation.browser import send_validation_message
        send_validation_message(driver, action='automation',
                                expected_data={'end_date': payload.get('new_date', '')})
        result['validation_injected'] = True
    except Exception as e:
        _log(f'Banner injection failed (non-fatal): {e}', 'WARN')
        result['validation_injected'] = False

    return result
