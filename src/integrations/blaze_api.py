# =============================================================================
# src/integrations/blaze_api.py
# NO-TOUCH ZONE - Direct extraction from main_-_bloat.py
# Contains: BlazeTokenManager, get_api_data, scrape_blaze_data_from_browser,
#           update_single_promotion_in_memory, monitor_browser_return,
#           analyze_blaze_network_traffic
# Step 2: No-Touch Zone Migration - extracted verbatim, zero logic changes.
# =============================================================================
import os
import json
import time
import re
import requests
import threading
import traceback
from pathlib import Path
from src.session import session
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta

# Selenium (optional - Blaze browser ops)
import os
import sys
import json
import time
import threading
import traceback
from pathlib import Path
from typing import Optional, Dict, List, Any
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException
    from selenium.webdriver.support.ui import Select
    from selenium.webdriver.common.action_chains import ActionChains
    try:
        import undetected_chromedriver as uc
        USE_UNDETECTED = True
    except Exception:
        USE_UNDETECTED = False
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("[WARN] Selenium not available")


# NOTE: GLOBAL_DATA and session references resolved in Step 4 (SessionManager wiring).
# For now, functions reference GLOBAL_DATA as they did in the monolith.

# ── Module-level constants (were globals in the monolith) ────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # project root
REPORTS_DIR     = BASE_DIR / 'reports'
GROUPS_FILE     = BASE_DIR / 'promotion_groups.json'
BLAZE_TOKEN_FILE = BASE_DIR / 'blaze_token.json'


def load_stored_token() -> Optional[str]:
    """Reads the Blaze API token from blaze_token.json. Monolith: line 3258."""
    try:
        if BLAZE_TOKEN_FILE.exists():
            with open(BLAZE_TOKEN_FILE, 'r') as f:
                data = json.load(f)
                token = data.get('token')
                if token:
                    return str(token).strip()
    except Exception as e:
        print(f"[WARN] Failed to load stored token: {e}")
    return None


def validate_token(token: str) -> bool:
    """
    Validate a Blaze API token by making a lightweight API call.
    Returns True if valid (200 OK), False otherwise. Monolith: line 3280.
    """
    if not token:
        return False
    headers = {"Authorization": f"Token {token}"}
    try:
        r = requests.get(
            "https://api.blaze.me/api/v1/mgmt/shops?start=0&limit=1",
            headers=headers, timeout=5
        )
        return r.status_code == 200
    except Exception:
        return False
# These will be updated when SessionManager is fully wired.



def analyze_blaze_network_traffic():
    """
    DIAGNOSTIC: Analyzes browser network logs to find the actual Collections API endpoint.
    Call this after navigating to Smart Collections page.
    """
    driver = session.get_browser()
    if not driver:
        print("[DIAG] No browser instance")
        return
    
    print("\n" + "="*70)
    print("[DIAGNOSTIC] Analyzing Blaze Network Traffic...")
    print("="*70)
    
    try:
        logs = driver.get_log('performance')
        collections_requests = []
        
        for entry in logs:
            try:
                msg = json.loads(entry['message'])['message']
                if msg['method'] == 'Network.requestWillBeSent':
                    req = msg['params']['request']
                    url = req.get('url', '')
                    
                    # Look for any request that might be collections-related
                    if 'api.blaze.me' in url and any(keyword in url.lower() for keyword in ['collection', 'smart', 'group', 'category']):
                        collections_requests.append({
                            'url': url,
                            'method': req.get('method', 'GET'),
                            'headers': req.get('headers', {}),
                            'postData': req.get('postData', None)
                        })
            except:
                continue
        
        if collections_requests:
            print(f"\n[DIAG] Found {len(collections_requests)} potential Collections API calls:")
            for idx, req in enumerate(collections_requests, 1):
                print(f"\n--- Request #{idx} ---")
                print(f"URL: {req['url']}")
                print(f"Method: {req['method']}")
                if req['postData']:
                    print(f"POST Data: {req['postData'][:200]}")
        else:
            print("[DIAG] No collections-related API calls found in logs")
            print("[DIAG] Try manually clicking around the Smart Collections page first")
        
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"[DIAG] Error analyzing logs: {e}")
        traceback.print_exc()


def get_api_data(token_input):
    """
    Fetch Blaze API data with FLEXIBLE token input.
    Accepts: Dict {'promo_token': '...', 'group_token': '...'} OR single string token
    Routes requests to appropriate token based on endpoint.
    """
    # --- FLEXIBLE INPUT HANDLING ---
    if isinstance(token_input, dict):
        promo_token = token_input.get('promo_token', '')
        group_token = token_input.get('group_token', '')
        
        # Fallback if one is missing
        if not promo_token:
            promo_token = group_token
        if not group_token:
            group_token = promo_token
            
        print(f"[API] Using dual tokens: Promo={promo_token[:10]}... | Group={group_token[:10]}...")
    else:
        # Legacy single-token mode
        promo_token = str(token_input)
        group_token = str(token_input)
        print(f"[API] Using single token mode: {promo_token[:10]}...")
    
    # 1. Fetch Shops (uses promo_token)
    shops = {}
    try:
        headers = {"Authorization": f"Token {promo_token}"}
        r = requests.get("https://api.blaze.me/api/v1/mgmt/shops?start=0&limit=500", 
                        headers=headers, timeout=10)
        if r.ok:
            for s in r.json().get('values', []):
                shops[s['id']] = s['name']
        print(f"[API] [OK] Fetched {len(shops)} shops")
    except Exception as e:
        print(f"[API] [ERROR] Shops fetch failed: {e}")
    
    # 2. Fetch Collections (uses group_token)
    colls = {}
    skip = 0  # [SUCCESS] CHANGE 1: Use 'skip' instead of 'start'
    try:
        headers = {"Authorization": f"Token {group_token}"}
        
        while True:
            # [SUCCESS] CHANGE 2: Add '/search' to endpoint
            # [SUCCESS] CHANGE 3: Use 'skip=' parameter instead of 'start='
            url = f"https://api.blaze.me/api/v1/mgmt/smartcollections/search?skip={skip}&limit=200"
            r = requests.get(url, headers=headers, timeout=10)
            
            if not r.ok:
                print(f"[API] [ERROR] Collections endpoint returned {r.status_code}: {r.text[:100]}")
                break
            
            data = r.json()
            vals = data if isinstance(data, list) else data.get('values', [])
            
            if not vals:
                break
            
            for c in vals:
                c_id = c.get('id', c.get('_id'))
                c_name = c.get('name')
                if c_id and c_name:
                    colls[c_id] = c_name
            
            if len(vals) < 200:
                break
            skip += 200  # [SUCCESS] CHANGE 3b: Increment 'skip' not 'start'
        
        print(f"[API] [OK] Fetched {len(colls)} collections")
        
        # DEBUG: Print first 3 collections to verify
        if colls:
            sample = list(colls.items())[:3]
            print(f"[API] Sample collections: {sample}")
        else:
            print("[API] [!] Ὢ8Ὢ8Ὢ8Ὢ8 WARNING: Zero collections returned!")
            
    except Exception as e:
        print(f"[API] [ERROR] Collections fetch failed: {e}")
        traceback.print_exc()
    
    # 3. Fetch Promotions (uses promo_token)
    promos = []
    start = 0
    try:
        headers = {"Authorization": f"Token {promo_token}"}
        
        while True:
            r = requests.get(
                f"https://api.blaze.me/api/v1/mgmt/company/promotions?start={start}&limit=100",
                headers=headers, timeout=10
            )
            if not r.ok:
                print(f"[API] [ERROR] Promotions endpoint returned {r.status_code}")
                break
            
            vals = r.json().get('values', [])
            if not vals:
                break
            
            promos.extend(vals)
            
            if len(promos) >= r.json().get('total', 0):
                break
            start += 100
        
        print(f"[API] [OK] Fetched {len(promos)} promotions")
    except Exception as e:
        print(f"[API] [ERROR] Promotions fetch failed: {e}")
    
    return shops, colls, promos



def scrape_blaze_data_from_browser():
    """
    Retrieves Blaze Data with "Smart Collection" Page Redirect.
    UPDATED: Uses a temporary background tab for token sniffing to avoid hijacking the Dashboard.
    LOGIC UPDATE: Strictly enforces fetching fresh Smart Collections to ensure new groups appear.
    """
    driver = session.get_browser()
    if not driver:
        return None, "Browser not initialized - cannot sniff token."

    # --- HELPER: LOG SNIFFER ---
    def sniff_token_from_logs(target_endpoint):
        print(f"[TOKEN] Sniffing logs for endpoint: {target_endpoint}...")
        try:
            logs = driver.get_log('performance')
            for entry in logs:
                try:
                    message_obj = json.loads(entry['message'])
                    message = message_obj.get('message', {})
                    if message.get('method') == 'Network.requestWillBeSent':
                        req = message['params']['request']
                        url = req.get('url', '')
                        if 'api.blaze.me' in url and target_endpoint in url:
                            headers = req.get('headers', {})
                            auth = next((v for k, v in headers.items() if k.lower() == 'authorization'), None)
                            if auth and 'Token' in auth:
                                return auth.replace('Token ', '').strip()
                except: continue
        except Exception as e:
            print(f"[WARN] Log sniff error: {e}")
        return None

    # --- STEP 1: TEST EXISTING TOKEN ---
    current_token = load_stored_token() or session.get_blaze_token()
    shops, raw_promos = {}, []
    colls = load_groups() # Load cache first
    
    # Check if we already have a token that works for EVERYTHING
    if current_token:
        print(f"[TOKEN] Verifying current token...")
        shops, new_colls, raw_promos = get_api_data(current_token)
        
        # Merge new groups into cache
        if new_colls: 
            colls.update(new_colls)
            save_groups(colls)
        
        # LOGIC UPDATE: Ensure we actually fetched groups if we have a token
        # If new_colls is empty but we have cached groups, it implies the token 
        # failed to fetch groups (Limited Scope). We should force a refresh.
        groups_valid = False
        if new_colls and len(new_colls) > 0:
            groups_valid = True
        elif len(colls) == 0:
            # If cache is empty and API is empty, allow it (maybe truly 0 groups)
            groups_valid = True 
        
        if groups_valid and len(raw_promos) > 0:
            print("[TOKEN] Current token is VALID for both Groups and Promos. No redirect needed.")
            session.set_blaze_token(current_token)
        else:
            print("[TOKEN] Token is PARTIAL or INVALID (Groups missing). Initiating re-scrape sequence...")
            current_token = None # Trigger scrape
            # We don't wipe 'colls' here so we preserve old names if scrape fails, 
            # but we force the scrape to try and get new ones.

    # --- STEP 2: REDIRECT SEQUENCE (If needed) ---
    if not current_token:
        print("[NAV] Token invalid or missing. Opening background tab to sniff...")
        
        # SAVE CURRENT TAB
        try:
            original_handle = driver.current_window_handle
        except:
            original_handle = driver.window_handles[0]

        # OPEN NEW TAB & SWITCH
        driver.execute_script("window.open('about:blank', '_blank');")
        time.sleep(0.5)
        new_handle = driver.window_handles[-1]
        driver.switch_to.window(new_handle)
        
        try:
            # A. Go to Smart Collections to generate the right traffic
            print("[NAV] Redirecting to Smart Collections page (Background)...")
            driver.get("https://retail.blaze.me/company-promotions/smart-collections")
            time.sleep(6) # Wait for page load & API calls
            
            # B. Sniff specifically for the smartcollections endpoint
            collections_token = sniff_token_from_logs('smartcollections')
            
            if collections_token:
                print("[TOKEN] captured fresh Collections Token!")
                current_token = collections_token
                save_stored_token(current_token)
            else:
                print("[WARN] Failed to capture token even after redirect.")
        
        except Exception as e:
            print(f"[ERROR] Background sniff failed: {e}")
            
        finally:
            # C. CLOSE TAB & RETURN
            print("[NAV] Closing background tab and returning...")
            try:
                driver.close()
                driver.switch_to.window(original_handle)
            except:
                print("[WARN] Could not switch back to original tab")

        # D. Fetch Data with new token
        if current_token:
            shops, new_colls, raw_promos = get_api_data(current_token)
            if new_colls:
                colls.update(new_colls)
                save_groups(colls)

    # --- STEP 3: PARSE DATA ---
    session.set_blaze_token(current_token)
    
    if not raw_promos: 
        return None, "Token expired or missing. Please Login to Blaze in a new tab."

    parsed = []
    
    # Map Collection IDs to Names
    def get_group_name(gid):
        return colls.get(gid, gid) 
    
    # Helper: Format buy requirements from criteria
    def parse_buy_requirements(criteria_groups):
        requirements = []
        for cg in criteria_groups:
            rules = []
            if isinstance(cg, list): 
                rules = cg 
            elif isinstance(cg, dict): 
                rules = cg.get('criteria', [])
            
            for rule in rules:
                qty = rule.get('minimum', 1)
                items = []
                
                # Check products
                if rule.get('products'):
                    items.extend([p.get('name', 'Product') for p in rule.get('products', [])])
                
                # Check smart collections
                if rule.get('smartCollectionIds'):
                    items.extend([get_group_name(cid) for cid in rule.get('smartCollectionIds', [])])
                
                # Check categories
                if rule.get('categories'):
                    items.extend([c.get('name', 'Category') for c in rule.get('categories', [])])
                
                if items:
                    requirements.append({
                        'quantity': qty,
                        'items': items
                    })
        
        return requirements
    
    # v12.26.7: Parse discountRequirements for BOGO/Bundle Buy/Get quantities
    def parse_discount_requirements(promo_data: dict) -> dict:
        """Extract Buy/Get quantities and smart collections from discountRequirements array.
        
        discountRequirements[0] = Buy requirement (minAmt = Buy X)
        discountRequirements[1] = Get reward (minAmt = Get Y), or fallback to top-level discountAmt
        Each entry may contain smartCollectionIds for product group targeting.
        """
        result = {
            'buy_qty': 1,
            'get_qty': 1,
            'buy_collections': [],
            'get_collections': [],
        }
        
        reqs = promo_data.get('discountRequirements')
        if not reqs or not isinstance(reqs, list):
            return result
        
        try:
            # Buy requirement (first entry)
            if len(reqs) >= 1 and reqs[0]:
                buy_req = reqs[0]
                buy_amt = buy_req.get('minAmt')
                if buy_amt is not None:
                    result['buy_qty'] = int(float(buy_amt))
                # Capture smart collections tied to buy requirement
                for cid in buy_req.get('smartCollectionIds', []):
                    result['buy_collections'].append({'id': cid, 'name': get_group_name(cid)})
            
            # Get reward (second entry or fallback)
            if len(reqs) >= 2 and reqs[1]:
                get_req = reqs[1]
                get_amt = get_req.get('minAmt')
                if get_amt is not None:
                    result['get_qty'] = int(float(get_amt))
                # Capture smart collections tied to get reward
                for cid in get_req.get('smartCollectionIds', []):
                    result['get_collections'].append({'id': cid, 'name': get_group_name(cid)})
            else:
                # Fallback: use top-level discountAmt as get quantity
                target = promo_data.get('target', {})
                disc_amt = target.get('discountAmt')
                if disc_amt is not None:
                    result['get_qty'] = int(float(disc_amt))
        except (IndexError, ValueError, TypeError) as e:
            print(f"[WARN] discountRequirements parse error: {e}")
        
        return result
    
    # Helper: Format time constraint
    def parse_time_constraint(tc):
        if not tc:
            return None
        return {
            'days': tc.get('daysOfWeek', []),
            'start_time': tc.get('startTime', ''),
            'end_time': tc.get('endTime', '')
        }
    
    # v12.26.7: Parse active days from term object (boolean dict)
    def parse_active_days(promo_data: dict) -> list:
        """Extract weekday schedule from term.activeDays boolean dictionary.
        
        API returns: term.activeDays = {"monday": true, "tuesday": false, ...}
        Returns: ["Monday", "Wednesday", "Friday"] (only true days)
        """
        term = promo_data.get('term')
        if not term or not isinstance(term, dict):
            return []
        
        active_days = term.get('activeDays')
        if not active_days or not isinstance(active_days, dict):
            return []
        
        # Map API keys to display names
        day_order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        return [day.capitalize() for day in day_order if active_days.get(day, False)]
    
    # Helper: Parse priority with robust error handling
    def parse_priority(promo_data):
        try:
            raw_rank = int(promo_data.get('rank', 5))  # Force integer conversion
        except (ValueError, TypeError):
            raw_rank = 5  # Default safe fallback
        return PRIORITY_MAP.get(raw_rank, f"{raw_rank} (Unknown)")

    for p in raw_promos:
        try:
            target = p.get('target', {})
            shop_ids = p.get('shopIds', [])
            
            names = []
            for sid in shop_ids:
                raw_name = shops.get(sid, sid)
                # v12.26.1: Use canonical normalize_store_name() instead of regex-only strip
                clean_name = normalize_store_name(str(raw_name))
                names.append(clean_name)

            if len(names) >= 12:
                loc_display = "All Locations"
            else:
                loc_display = ', '.join(sorted(names)) if names else "Unknown"

            buy_groups = []
            c_groups = p.get('criteriaGroups', [])
            for cg in c_groups:
                rules = []
                if isinstance(cg, list): rules = cg 
                elif isinstance(cg, dict): rules = cg.get('criteria', [])
                for rule in rules:
                    for cid in rule.get('smartCollectionIds', []):
                        buy_groups.append({'id': cid, 'name': get_group_name(cid)})
            
            get_groups = []
            for cid in target.get('smartCollectionIds', []): 
                get_groups.append({'id': cid, 'name': get_group_name(cid)})

            auto_apply = p.get('autoApply', False)
            buy_requirements = parse_buy_requirements(c_groups)
            restrictions = {
                'member_groups': p.get('memberGroups', []),
                'consumer_types': p.get('consumerTypes', []),
                'sales_channels': p.get('salesChannels', [])
            }
            time_constraint = parse_time_constraint(p.get('timeConstraint'))
            
            # v12.26.7: Description fallback chain
            # displayDescription â†’ shopDescription â†’ description â†’ ''
            description = (
                p.get('displayDescription')
                or p.get('shopDescription')
                or p.get('description')
                or ''
            )
            
            # v12.26.7: Parse BOGO/Bundle quantities from discountRequirements
            disc_reqs = parse_discount_requirements(p)
            
            # v12.26.7: Parse weekday schedule from term.activeDays
            active_days = parse_active_days(p)
            # Merge with time_constraint â€” active_days takes priority if non-empty
            if active_days and time_constraint:
                time_constraint['days'] = active_days
            elif active_days:
                time_constraint = {'days': active_days, 'start_time': '', 'end_time': ''}
            
            # v12.26.7: Merge discountRequirements collections into buy/get groups
            if disc_reqs['buy_collections']:
                for coll in disc_reqs['buy_collections']:
                    if not any(bg['id'] == coll['id'] for bg in buy_groups):
                        buy_groups.append(coll)
            if disc_reqs['get_collections']:
                for coll in disc_reqs['get_collections']:
                    if not any(gg['id'] == coll['id'] for gg in get_groups):
                        get_groups.append(coll)

            parsed.append({
                'ID': p.get('id'),
                'Name': p.get('name'),
                'Status': 'Active' if p.get('active') else 'Inactive',
                'Locations': loc_display,
                'buy_groups': buy_groups, 
                'get_groups': get_groups,
                'Discount Value Type': target.get('discountType'),
                'Discount Value': target.get('discountAmt'),
                'Start Date': datetime.fromtimestamp(p.get('startDate', 0)/1000).strftime('%Y-%m-%d') if p.get('startDate') else '',
                'End Date': datetime.fromtimestamp(p.get('endDate', 0)/1000).strftime('%Y-%m-%d') if p.get('endDate') else '',
                'auto_apply': auto_apply,
                'description': description,
                'buy_requirements': buy_requirements,
                'target_type': target.get('discountType', ''),
                'target_value': target.get('discountAmt', ''),
                'stackable': p.get('stackable', False),
                'apply_lowest_price_first': p.get('applyLowestPriceFirst', False),
                'priority': parse_priority(p),
                'enable_promo_code': p.get('enablePromoCode', False),
                'promo_code': p.get('promoCode', ''),
                'max_uses': p.get('maxUses', 'Unlimited'),
                'max_uses_per_consumer': p.get('maxUsesPerConsumer', 'Unlimited'),
                'restrictions': restrictions,
                'time_constraint': time_constraint,
                # v12.26.7: BOGO/Bundle quantities from discountRequirements
                'buy_qty': disc_reqs['buy_qty'],
                'get_qty': disc_reqs['get_qty'],
            })
        except Exception as inner_e:
            print(f"[ERROR] Parsing promotion failed: {inner_e}")
            continue

    return parsed, None


def update_single_promotion_in_memory(promo_id: str):
    """
    Fetches a single promotion by ID and updates the global DataFrame.
    """
    # Try global memory first, then file storage
    token = session.get_blaze_token() or load_stored_token()
    
    if not token:
        print("[WARN] No token available for single-row update.")
        return

    headers = {"Authorization": f"Token {token}"}
    try:
        # Fetch just the one item
        url = f"https://api.blaze.me/api/v1/mgmt/company/promotions/{promo_id}"
        print(f"[SYNC] Fetching single row: {promo_id}...")
        r = requests.get(url, headers=headers)
        
        if not r.ok:
            print(f"[WARN] Failed to fetch row {promo_id}: {r.status_code}")
            return

        p = r.json()
        target = p.get('target', {})
        
        # v12.26.7: Description fallback chain
        description = (
            p.get('displayDescription')
            or p.get('shopDescription')
            or p.get('description')
            or ''
        )
        
        # v12.26.7: BOGO/Bundle quantities from discountRequirements
        buy_qty = 1
        get_qty = 1
        disc_reqs = p.get('discountRequirements')
        if disc_reqs and isinstance(disc_reqs, list):
            try:
                if len(disc_reqs) >= 1 and disc_reqs[0]:
                    amt = disc_reqs[0].get('minAmt')
                    if amt is not None:
                        buy_qty = int(float(amt))
                if len(disc_reqs) >= 2 and disc_reqs[1]:
                    amt = disc_reqs[1].get('minAmt')
                    if amt is not None:
                        get_qty = int(float(amt))
                elif target.get('discountAmt') is not None:
                    get_qty = int(float(target['discountAmt']))
            except (ValueError, TypeError):
                pass
        
        # v12.26.7: Weekday schedule from term.activeDays
        term = p.get('term')
        active_days_list = []
        if term and isinstance(term, dict):
            ad = term.get('activeDays')
            if ad and isinstance(ad, dict):
                day_order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                active_days_list = [d.capitalize() for d in day_order if ad.get(d, False)]
        
        # Construct the row update (Matches structure of full scrape)
        new_row = {
            'ID': p.get('id'),
            'Name': p.get('name'),
            'Status': 'Active' if p.get('active') else 'Inactive',
            # We keep existing location/group data to avoid complex parsing in this lightweight update
            # or you can fetch shops if strictly needed. For speed, we update the core edit fields.
            'Discount Value Type': target.get('discountType'),
            'Discount Value': target.get('discountAmt'),
            'Start Date': datetime.fromtimestamp(p.get('startDate', 0)/1000).strftime('%Y-%m-%d') if p.get('startDate') else '',
            'End Date': datetime.fromtimestamp(p.get('endDate', 0)/1000).strftime('%Y-%m-%d') if p.get('endDate') else '',
            'description': description,
            'buy_qty': buy_qty,
            'get_qty': get_qty,
            # v12.26.7: Weekday schedule from term.activeDays
            'time_constraint': {'days': active_days_list, 'start_time': '', 'end_time': ''} if active_days_list else None,
        }
        
        # UPDATE THE DATAFRAME IN MEMORY
        df = session.get_blaze_df()
        if df is not None and not df.empty and 'ID' in df.columns:
            # Check if ID exists
            idx = df.index[df['ID'] == promo_id].tolist()
            if idx:
                row_idx = idx[0]
                # Update specific fields
                df.at[row_idx, 'Name'] = new_row['Name']
                df.at[row_idx, 'Status'] = new_row['Status']
                df.at[row_idx, 'Discount Value Type'] = new_row['Discount Value Type']
                df.at[row_idx, 'Discount Value'] = new_row['Discount Value']
                df.at[row_idx, 'Start Date'] = new_row['Start Date']
                df.at[row_idx, 'End Date'] = new_row['End Date']
                # v12.26.7: Update new API-mapped fields
                df.at[row_idx, 'description'] = new_row['description']
                df.at[row_idx, 'buy_qty'] = new_row['buy_qty']
                df.at[row_idx, 'get_qty'] = new_row['get_qty']
                if new_row.get('time_constraint'):
                    df.at[row_idx, 'time_constraint'] = new_row['time_constraint']
                
                print(f"[SYNC] Successfully updated row {promo_id} in memory.")
                
                # Signal Frontend to refresh
                session.set('blaze_last_update_ts', time.time())
            else:
                print("[SYNC] ID not found in cache. Full refresh recommended.")
    except Exception as e:
        print(f"[ERROR] Single row sync failed: {e}")


def monitor_browser_return(promo_id: str):
    """
    Watches the browser URL. When it returns to the list page, triggers a single-row sync.
    """
    driver = session.get_browser()
    if not driver: return

    print(f"[WATCHER] Monitoring browser for return from {promo_id}...")
    
    # Wait loop (Timeout after 60 seconds to save resources)
    max_wait = 60
    for _ in range(max_wait):
        try:
            current_url = driver.current_url
            # If we are back on the main list page
            if "company-promotions/promotions" in current_url and promo_id not in current_url:
                print("[WATCHER] Detected return to list! Waiting 300ms...")
                time.sleep(0.3) # User requested delay
                
                # Trigger Update
                update_single_promotion_in_memory(promo_id)
                return
            time.sleep(1)
        except:
            break
    print("[WATCHER] Timed out or browser closed.")


class BlazeTokenManager:
    """
    Manages Blaze API authentication tokens with caching and validation.
    Supports headless and GUI fallback login for background API operations.
    Does NOT interfere with the main browser instance used for MIS automation.
    """
    TOKEN_FILE = BASE_DIR / 'blaze_token_cache.json'
    
    @staticmethod
    def validate(token):
        """Validate token by making a test API call."""
        if not token:
            return False
        try:
            r = requests.get(
                "https://api.blaze.me/api/v1/mgmt/shops?start=0&limit=1",
                headers={"Authorization": f"Token {token}"},
                timeout=5
            )
            return r.status_code == 200
        except:
            return False

    @classmethod
    def get_token(cls):
        """
        Get a valid token using this priority:
        1. Try cached token from file
        2. If expired, sniff new token (headless first, GUI fallback)
        3. Save and return new token
        """
        # 1. Try Cache
        if cls.TOKEN_FILE.exists():
            try:
                with open(cls.TOKEN_FILE, 'r') as f:
                    cached = json.load(f).get('token')
                    if cls.validate(cached):
                        print("[TOKEN] Using cached session.")
                        return cached
            except:
                pass
        
        # 2. Sniff new token (Headless -> GUI Fallback)
        creds = load_credentials_config().get('blaze', {})
        email = creds.get('email')
        password = creds.get('password')
        
        if not email or not password:
            print("[TOKEN] No credentials found in config.")
            return None

        print("[TOKEN] Cache expired. Sniffing new token...")
        token = cls._sniff_login(email, password, headless=True)
        
        if not token:
            print("[TOKEN] Headless failed. Trying visible browser...")
            token = cls._sniff_login(email, password, headless=False)
            
        if token:
            cls._save(token)
            return token
        
        print("[TOKEN] Failed to obtain token.")
        return None

    @staticmethod
    def _sniff_login(email, password, headless=True):
        """
        Login to Blaze and sniff the Authorization token from network logs.
        Uses a separate browser instance to avoid interfering with main GUI.
        """
        driver = None
        try:
            from selenium import webdriver
            from selenium.webdriver.common.by import By
            from selenium.webdriver.common.keys import Keys
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            
            options = webdriver.ChromeOptions()
            if headless:
                options.add_argument('--headless=new')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
            
            driver = webdriver.Chrome(options=options)
            driver.get("https://retail.blaze.me/login")
            
            # Wait for login form
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.NAME, "email"))
            )
            
            # Login
            driver.find_element(By.NAME, "email").send_keys(email)
            driver.find_element(By.NAME, "password").send_keys(password + Keys.RETURN)
            
            time.sleep(5)  # Wait for login to complete
            
            # Navigate to promotions page to trigger API calls
            driver.get("https://retail.blaze.me/company-promotions/promotions?page=0&pageSize=20")
            time.sleep(5)  # Wait for API calls
            
            # Sniff logs for token
            logs = driver.get_log('performance')
            for entry in logs:
                try:
                    msg = json.loads(entry['message'])['message']
                    if 'Network.requestWillBeSent' in msg.get('method', ''):
                        req = msg['params']['request']
                        if 'api.blaze.me' in req.get('url', ''):
                            headers = req.get('headers', {})
                            auth = next(
                                (v for k, v in headers.items() if k.lower() == 'authorization'),
                                None
                            )
                            if auth:
                                token = auth.replace('Token ', '').replace('Bearer ', '').strip()
                                print(f"[TOKEN] Successfully captured token!")
                                return token
                except:
                    pass
                    
        except Exception as e:
            print(f"[TOKEN] Login Error: {e}")
        finally:
            if driver:
                driver.quit()
        
        return None

    @classmethod
    def _save(cls, token):
        """Save token to cache file."""
        try:
            with open(cls.TOKEN_FILE, 'w') as f:
                json.dump({
                    'token': token,
                    'updated': str(datetime.now())
                }, f)
            print(f"[TOKEN] Saved to cache: {cls.TOKEN_FILE}")
        except Exception as e:
            print(f"[TOKEN] Failed to save cache: {e}")

    @classmethod
    def fetch_global_brands(cls, token=None) -> Dict[str, str]:
        """
        Fetch the master brand list from Blaze API.
        Returns: {brandId: brandName}
        """
        if not token:
            token = cls.get_token()
        if not token:
            print("[BRANDS] No token available for brand fetch.")
            return {}

        headers = {"Authorization": f"Token {token}"}
        brands_map = {}
        start = 0
        limit = 500  # Blaze API max per page
        
        try:
            print("[BRANDS] Fetching global brand list...")
            while True:
                url = f"https://api.blaze.me/api/v1/mgmt/brands?start={start}&limit={limit}"
                
                try:
                    r = requests.get(url, headers=headers, timeout=10)
                    
                    if r.status_code == 404:
                        print("[BRANDS] WARNING: Global brand endpoint not available (404). Using fallback methods.")
                        break  # Not an error, just not available
                    
                    if r.status_code != 200:
                        print(f"[BRANDS] API Error {r.status_code}: {r.text[:100]}")
                        break
                    
                    data = r.json()
                    items = data.get('values', [])
                    
                    if not items:
                        break
                    
                    for brand in items:
                        brand_id = brand.get('id')
                        brand_name = brand.get('name')
                        if brand_id and brand_name:
                            brands_map[brand_id] = brand_name
                    
                    # Check if we got all brands
                    total = data.get('total', 0)
                    if len(brands_map) >= total or len(items) < limit:
                        break
                    
                    start += limit
                    
                except requests.exceptions.RequestException as req_err:
                    print(f"[BRANDS] WARNING: Network error: {req_err}")
                    break
            
            if brands_map:
                print(f"[BRANDS] SUCCESS: Fetched {len(brands_map)} brands")
            else:
                print(f"[BRANDS] WARNING: No brands fetched (will use brandName fallback)")
            return brands_map
            return brands_map
            
        except Exception as e:
            print(f"[BRANDS] ERROR: Fetch failed: {e}")
            return {}

