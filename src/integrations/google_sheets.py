# =============================================================================
# src/integrations/google_sheets.py
# NO-TOUCH ZONE - Direct extraction from main_-_bloat.py
# Contains: authenticate_google_sheets, fetch_google_sheet_data, fetch_tax_rates,
#           get_available_tabs, open_google_sheet_in_browser, scan_bracket_headers
# Step 2: No-Touch Zone Migration - extracted verbatim, zero logic changes.
# =============================================================================
import os
import json
import time
import traceback
from pathlib import Path
from src.session import session
from typing import Optional, Dict, List, Any
import pandas as pd
from datetime import datetime
from src.utils.sheet_helpers import detect_header_row
# Google auth imports — graceful degradation when library not installed
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    Request = Credentials = InstalledAppFlow = build = None  # type: ignore

# NOTE: GLOBAL_DATA / session references resolved in Step 4.

# ── Module-level profile globals ─────────────────────────────────────────────
# Set by configure_google_sheets_profile() called from app._init_active_profile()
# Mirrors the monolith's: TOKEN_FILE = ACTIVE_PROFILE['token_file'] (line 2215)
TOKEN_FILE:       Path | None = None
CREDENTIALS_FILE: Path | None = None
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']  # monolith line 2752


# ── Tax rate defaults (defined in blaze_sync.py, mirrored here for google_sheets independence) ──
# Project root constants (mirrored from monolith global scope)
_PROJECT_ROOT   = Path(__file__).resolve().parent.parent.parent
TAX_CONFIG_FILE = _PROJECT_ROOT / 'tax_config.json'

DEFAULT_TAX_RATES = {
    'CA_base': 7.25,
    'CA_cannabis_excise': 15.0,
    'CA_cannabis_cultivation_flower': 10.08,
    'CA_cannabis_cultivation_trim': 3.00,
    'CA_cannabis_cultivation_fresh': 1.41,
    'markup': 80.0,
}

def configure_google_sheets_profile(token_file: str | None, credentials_file: str | None) -> None:
    """
    Inject active profile paths into this module's globals.
    Called once from app._init_active_profile() whenever the profile changes.
    Mirrors how the monolith set TOKEN_FILE/CREDENTIALS_FILE at startup.
    """
    global TOKEN_FILE, CREDENTIALS_FILE
    TOKEN_FILE       = Path(token_file)       if token_file       else None
    CREDENTIALS_FILE = Path(credentials_file) if credentials_file else None
    print(f"[SHEETS] Token:       {TOKEN_FILE}")
    print(f"[SHEETS] Credentials: {CREDENTIALS_FILE}")


def authenticate_google_sheets() -> Optional[object]:
    """Authenticate with Google Sheets API."""
    creds = None
    
    # v12.24.8: Guard against None config files (no profile detected)
    if TOKEN_FILE is None or CREDENTIALS_FILE is None:
        print(f"[INFO] No profile configured - Google Sheets auth not available")
        return None
    
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception as e:
            print(f"[WARN] Token corrupted: {e}")
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except:
                creds = None
        
        if not creds:
            if not CREDENTIALS_FILE.exists():
                return None
            
            max_wait = 10
            waited = 0
            while not session.get_browser_ready() and waited < max_wait:
                time.sleep(1)
                waited += 1
            
            if not session.get_browser_ready():
                flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
                creds = flow.run_local_server(port=8080, prompt='consent')
            else:
                driver = session.get_browser()
                flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
                flow.redirect_uri = 'http://localhost:8080/'
                auth_url, _ = flow.authorization_url(prompt='consent')
                
                driver.execute_script(f"window.open('{auth_url}', '_blank');")
                driver.switch_to.window(driver.window_handles[-1])
                
                try:
                    WebDriverWait(driver, 120).until(
                        lambda d: 'localhost:8080' in d.current_url or 'code=' in d.current_url
                    )
                    
                    current_url = driver.current_url
                    if 'code=' in current_url:
                        parsed = urlparse.urlparse(current_url)
                        code = urlparse.parse_qs(parsed.query).get('code', [None])[0]
                        if code:
                            flow.fetch_token(code=code)
                            creds = flow.credentials
                    
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                except TimeoutException:
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                    return None
        
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        return service
    except Exception as e:
        print(f"[ERROR] Failed to build service: {e}")
        return None


def get_sheet_gid(spreadsheet_id: str, sheet_name: str) -> str | None:
    """Get the numeric GID for a specific sheet tab. Monolith: line 4677."""
    try:
        service = session.get_sheets_service()
        if not service:
            return None
        metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        for sheet in metadata.get('sheets', []):
            if sheet['properties']['title'] == sheet_name:
                return str(sheet['properties']['sheetId'])
        return None
    except Exception:
        return None


def open_google_sheet_in_browser(spreadsheet_id: str, sheet_name: str, row_number: int = None) -> bool:
    """
    Open Google Sheet tab in the automation browser.
    If the driver isn't initialized yet but the Launcher's Chrome is reachable
    on port 9222, auto-attaches on the fly so Open Sheet works without clicking
    Initialize first.
    """
    try:
        driver = session.get_browser()

        # Auto-attach to Launcher Chrome if driver not yet initialized
        if not driver:
            try:
                from selenium import webdriver as wd
                opts = wd.ChromeOptions()
                opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
                driver = wd.Chrome(options=opts)
                _ = driver.window_handles  # liveness check
                session.set_browser(driver)
                session.set_browser_ready(True)
                print("[SHEETS] Auto-attached to Chrome via port 9222 for Open Sheet")
            except Exception as attach_err:
                print(f"[SHEETS] Browser not ready and auto-attach failed: {attach_err}")
                return False

        if not driver:
            return False
        
        gid = get_sheet_gid(spreadsheet_id, sheet_name)
        base_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
        
        target_url = base_url
        if gid:
            target_url += f"#gid={gid}"
        if row_number:
            target_url += f"&range={row_number}:{row_number}"
        
        sheet_tab_found = False
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if spreadsheet_id in driver.current_url:
                sheet_tab_found = True
                if row_number or gid:
                    driver.get(target_url)
                break
        
        if not sheet_tab_found:
            driver.switch_to.new_window('tab')
            driver.get(target_url)
        
        return True
    except Exception as e:
        print(f"[ERROR] Failed to open Google Sheet: {e}")
        return False


def get_available_tabs(spreadsheet_id: str) -> List[str]:
    try:
        service = session.get_sheets_service()
        if not service:
            return []
        metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        return [sheet['properties']['title'] for sheet in metadata.get('sheets', [])]
    except:
        return []


def fetch_google_sheet_data(tab_name: str) -> Dict[str, pd.DataFrame]:
    """
    Fetch Google Sheet data and split into sections: Weekly, Monthly, Sale.
    Returns: {'weekly': df, 'monthly': df, 'sale': df}
    """
    try:
        service = session.get_sheets_service()
        spreadsheet_id = session.get_spreadsheet_id()
        
        if not service or not spreadsheet_id:
            raise ValueError("Service not available")
        
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab_name}'!A1:AZ2000"
        ).execute()
        
        values = result.get('values', [])
        empty_ret = {'weekly': pd.DataFrame(), 'monthly': pd.DataFrame(), 'sale': pd.DataFrame()}
        if not values:
            return empty_ret
        
        header_row_idx = detect_header_row(values)
        session.set_mis_header_row_idx(header_row_idx)
        
        # Get standardized headers from the first section (Weekly)
        headers = [str(cell).strip() for cell in values[header_row_idx]]
        headers.append('_SHEET_ROW_NUM')
        expected_cols = len(headers)
        
        # Cleanup column names
        clean_cols = [col if col == '_SHEET_ROW_NUM' else col.strip().replace('\n', ' ') for col in headers]
        
        sections = {'weekly': [], 'monthly': [], 'sale': []}
        current_section = 'weekly'
        
        # Start scanning AFTER the first header
        i = header_row_idx + 1
        while i < len(values):
            row = values[i]
            row_str = " ".join([str(cell).strip() for cell in row]).upper()
            
            # --- SECTION SWITCHING LOGIC ---
            if "END420" in row_str:
                print(f"[SHEET-PARSE] Found END420 at row {i+1}, stopping parse")
                break # Stop parsing completely
            
            if "MONTHLYSTART" in row_str:
                print(f"[SHEET-PARSE] Found MONTHLYSTART at row {i+1}, switching to monthly section")
                current_section = 'monthly'
                i += 2 # Skip this flag row AND the next row (the new header)
                continue
                
            if "SALESTART" in row_str:
                print(f"[SHEET-PARSE] Found SALESTART at row {i+1}, switching to sale section")
                current_section = 'sale'
                i += 2 # Skip this flag row AND the next row (the new header)
                continue
                
            if "BREAK420" in row_str:
                i += 1
                continue
            
            # Process Data Row
            if len(row) >= 2 and str(row[1]).strip():
                # Pad/Slice to match header length exactly
                padded_row = row + [''] * (expected_cols - len(row))
                padded_row = padded_row[:expected_cols - 1] 
                padded_row.append(i + 1) # Add 1-based row number
                
                sections[current_section].append(padded_row)
            
            i += 1
            
        # Convert lists to DataFrames
        print(f"[SHEET-PARSE] Section summary: weekly={len(sections['weekly'])}, monthly={len(sections['monthly'])}, sale={len(sections['sale'])}")
        final_dfs = {}
        for sec, rows in sections.items():
            if rows:
                df = pd.DataFrame(rows, columns=clean_cols)
            else:
                df = pd.DataFrame(columns=clean_cols)
            final_dfs[sec] = df
        
        # v12.27.0: Scan for bracket headers and build alias map
        # Reset bracket maps for fresh scan on each sheet load
        _bracket_map = {}
        _prefix_map = {}
        _rebate_type_columns = []
        for sec in final_dfs:
            if not final_dfs[sec].empty:
                final_dfs[sec] = scan_bracket_headers(final_dfs[sec], section_name=sec)
            
        session.set_mis_current_sheet(tab_name)
        return final_dfs

    except Exception as e:
        print(f"[ERROR] Failed to fetch sheet: {e}")
        traceback.print_exc()
        return {'weekly': pd.DataFrame(), 'monthly': pd.DataFrame(), 'sale': pd.DataFrame()}


def fetch_tax_rates() -> dict:
    """
    Fetch tax rates with priority: DEFAULT_TAX_RATES < tax_config.json overrides
    No longer depends on Google Sheets for reliability.
    Returns: dict mapping store names to tax rates
    """
    # Start with hardcoded defaults
    tax_rates = DEFAULT_TAX_RATES.copy()
    
    # Try to load local overrides from tax_config.json
    if TAX_CONFIG_FILE.exists():
        try:
            with open(TAX_CONFIG_FILE, 'r') as f:
                local_overrides = json.load(f)
                # Merge: local overrides take precedence
                tax_rates.update(local_overrides)
                print(f"[TAX] Loaded {len(tax_rates)} tax rates (default + local overrides)")
        except Exception as e:
            print(f"[TAX] Failed to load tax_config.json: {e}")
            print(f"[TAX] Using {len(tax_rates)} default tax rates")
    else:
        print(f"[TAX] Using {len(tax_rates)} default tax rates (no local overrides)")
    
    return tax_rates


def scan_bracket_headers(df: pd.DataFrame, section_name: str = '') -> pd.DataFrame:
    """
    v12.27.0: Build bracket alias maps from DataFrame column names.
    
    Bracket headers are embedded in the SAME cell as the original header on a new line.
    After clean_cols (\\n → space), column names look like:
        "Weekday [Weekday]", "Brand [Brand]", "Wholesale? [Rebate type]"
    
    Builds:
        - bracket_map:  bracket name → full column name  ('[Weekday]' → 'Weekday [Weekday]')
        - prefix_map:   old short name → full column name ('Weekday' → 'Weekday [Weekday]')
        - rebate_type_columns: list of full column names containing [Rebate type]
    
    No rows are dropped — brackets are in column headers, not data rows.
    """
    import re
    bracket_re = re.compile(r'\[([^\]]+)\]')
    
    if df.empty:
        return df
    
    # Initialize maps — start fresh, merge into existing session maps
    _bracket_map = dict(session.get_mis_bracket_map())
    _prefix_map = dict(session.get_mis_prefix_map())
    _rebate_type_columns = list(session.get_mis_rebate_type_columns())
    
    for col_name in df.columns:
        col_str = str(col_name)
        match = bracket_re.search(col_str)
        if not match:
            continue
        
        bracket_text = match.group(1)        # e.g., "Weekday", "Rebate type"
        bracket_name = f"[{bracket_text}]"   # e.g., "[Weekday]", "[Rebate type]"
        prefix = col_str[:match.start()].strip()  # e.g., "Weekday", "Wholesale?"
        
        # v12.27.0: [Rebate type] appears under multiple columns (case-insensitive)
        if bracket_text.lower() == 'rebate type':
            if col_str not in session.get_mis_rebate_type_columns():
                _rebate_type_columns.append(col_str)
                print(f"[BRACKET-SCAN] {section_name}: [Rebate type] found in column '{col_str}'")
        else:
            # Map bracket name → full column name (store multiple case variants)
            _bracket_map[bracket_name] = col_str
            _bracket_map[f"[{bracket_text.lower()}]"] = col_str
            _bracket_map[f"[{bracket_text.title()}]"] = col_str
            _bracket_map[f"[{bracket_text.upper()}]"] = col_str
            print(f"[BRACKET-SCAN] {section_name}: '{bracket_name}' → column '{col_str}' (prefix='{prefix}')")
        
        # Map prefix → full column name (backward compat with old get_col calls)
        if prefix:
            _prefix_map[prefix] = col_str
            print(f"[BRACKET-SCAN] {section_name}: prefix '{prefix}' → column '{col_str}'")
    
    # Commit populated maps back to session
    session.set_mis_bracket_map(_bracket_map)
    session.set_mis_prefix_map(_prefix_map)
    session.set_mis_rebate_type_columns(_rebate_type_columns)

    if _bracket_map:
        print(f"[BRACKET-SCAN] {section_name}: bracket_map keys = {list(_bracket_map.keys())}")
    if _rebate_type_columns:
        print(f"[BRACKET-SCAN] {section_name}: rebate_type_columns = {_rebate_type_columns}")
    
    return df




def load_settings_dropdown_data(
    spreadsheet_id: str,
    sheets_service: Any,
) -> dict:
    """
    v12.17 / v12.26.7: Load dropdown options from Settings tab for Enhanced Create Popup.
    Fetches: Stores (Column A), Categories (Column C), Brand→LinkedBrand map.
    Brand mapping sourced from Brand Rebate Agreements tab first; falls back to Settings.

    Args:
        spreadsheet_id: Google Sheets ID.
        sheets_service: Authenticated Google Sheets service object.

    Returns dict with keys: 'stores', 'categories', 'brand_linked_map'.
    """
    result: dict = {'stores': [], 'categories': [], 'brand_linked_map': {}}

    STORE_SKIP    = {'all locations', 'all locations except:', 'all locations except', 'store name', 'store', ''}
    CATEGORY_SKIP = {'all categories', 'all categories except:', 'all categories except', 'categories', 'category', ''}

    if not sheets_service:
        print("[WARN] load_settings_dropdown_data: no sheets_service provided")
        return result

    try:
        metadata = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        settings_tab: str | None = None
        brand_rebate_tab: str | None = None

        for s in metadata.get('sheets', []):
            title = s['properties']['title']
            if 'brand rebate' in title.lower() or 'rebate agreement' in title.lower():
                brand_rebate_tab = title
            elif 'setting' in title.lower() and not settings_tab:
                settings_tab = title

        dropdown_source = settings_tab or brand_rebate_tab
        brand_source    = brand_rebate_tab or settings_tab

        if not dropdown_source:
            print("[WARN] load_settings_dropdown_data: no Settings or Brand Rebate tab found")
            return result

        print(f"[SETTINGS-DROPDOWN] dropdown_source={dropdown_source!r}, brand_source={brand_source!r}")

        # ── Stores + Categories ───────────────────────────────────────────────
        fetch_result = sheets_service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{dropdown_source}'!A1:Z500"
        ).execute()
        rows = fetch_result.get('values', [])

        if rows:
            header       = rows[0]
            header_lower = [str(h).lower().strip() for h in header]

            store_col_idx    = -1
            category_col_idx = -1
            for idx, h in enumerate(header_lower):
                if 'store name' in h or h == 'store':
                    store_col_idx = idx
                elif 'categor' in h and category_col_idx == -1:
                    category_col_idx = idx

            for row in rows[1:]:
                if store_col_idx >= 0 and store_col_idx < len(row):
                    sn = str(row[store_col_idx]).strip()
                    if sn and sn.lower() not in STORE_SKIP and sn.lower() not in ('nan', 'none', '-'):
                        if sn not in result['stores']:
                            result['stores'].append(sn)

                if category_col_idx >= 0 and category_col_idx < len(row):
                    cat = str(row[category_col_idx]).strip()
                    if cat and cat.lower() not in CATEGORY_SKIP and cat.lower() not in ('nan', 'none', '-'):
                        if cat not in result['categories']:
                            result['categories'].append(cat)

        # ── Brand → Linked Brand map ──────────────────────────────────────────
        if brand_source:
            brand_result = sheets_service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f"'{brand_source}'!A1:Z300"
            ).execute()
            brand_rows = brand_result.get('values', [])

            if brand_rows:
                brand_header_lower = [str(h).lower().strip() for h in brand_rows[0]]
                brand_col_idx  = -1
                linked_col_idx = -1
                for idx, h in enumerate(brand_header_lower):
                    if 'linked' in h and 'brand' in h:
                        linked_col_idx = idx
                    elif 'brand' in h and 'linked' not in h and 'contribution' not in h and brand_col_idx == -1:
                        brand_col_idx = idx

                if brand_col_idx >= 0 and linked_col_idx >= 0:
                    for row in brand_rows[1:]:
                        brand_name  = str(row[brand_col_idx]).strip()  if brand_col_idx  < len(row) else ''
                        linked_name = str(row[linked_col_idx]).strip() if linked_col_idx < len(row) else ''
                        skip = {'', 'nan', 'none', '-', 'brand', '* all *', '#hashtag'}
                        if brand_name and brand_name.lower() not in skip:
                            result['brand_linked_map'][brand_name.lower()] = linked_name

        print(f"[SETTINGS-DROPDOWN] {len(result['stores'])} stores, "
              f"{len(result['categories'])} categories, "
              f"{len(result['brand_linked_map'])} brand mappings loaded")
        return result

    except Exception as e:
        print(f"[ERROR] load_settings_dropdown_data: {e}")
        return result


# ── Step 9 Compatibility Stubs ────────────────────────────────────────────────
# These functions are imported by API blueprints but were not migrated in the
# No-Touch Zone (Step 2). They provide clear error messages pointing to
# the monolith location for the next extraction pass.

def extract_spreadsheet_id(url_or_id: str) -> str:
    """
    Extract spreadsheet ID from a Google Sheets URL or return the ID as-is.
    Migrated from monolith (referenced at mis_matcher.py import).
    """
    import re
    if not url_or_id:
        return ''
    # If it looks like a URL, extract the ID
    m = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', str(url_or_id))
    if m:
        return m.group(1)
    # Otherwise assume it's already an ID
    return str(url_or_id).strip()


def parse_tab_month_year(tab_name: str) -> tuple[str | None, str | None]:
    """
    Parse a Google Sheet tab name to extract month and year.
    e.g. 'January 2025' → ('January', '2025'), 'Jan 2025' → ('January', '2025')
    Returns (month_name, year_str) or (None, None) if not parseable.
    Migrated from monolith (referenced at mis_audit.py, mis_updown.py).
    """
    import re
    from datetime import datetime

    MONTH_ALIASES = {
        'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
        'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
        'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December',
    }

    if not tab_name:
        return None, None

    tab = str(tab_name).strip()
    # Try full month name + year
    m = re.match(
        r'(January|February|March|April|May|June|July|August|September|October|November|December)'
        r'\s+(\d{4})', tab, re.IGNORECASE
    )
    if m:
        return m.group(1).capitalize(), m.group(2)

    # Try abbreviated month + year
    m = re.match(r'([A-Za-z]{3})\s+(\d{4})', tab)
    if m:
        abbr = m.group(1).lower()
        full = MONTH_ALIASES.get(abbr)
        if full:
            return full, m.group(2)

    return None, None
