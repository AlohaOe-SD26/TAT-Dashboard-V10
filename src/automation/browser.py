# =============================================================================
# src/automation/browser.py
# NO-TOUCH ZONE - Direct extraction from main_-_bloat.py
# Contains: init_browser, mis_login, ensure_mis_ready, check_login_state,
#           ensure_logged_in, execute_in_background, mis_login_silent
# Step 2: No-Touch Zone Migration - extracted verbatim, zero logic changes.
# =============================================================================
import os
import time
import threading
import traceback
from pathlib import Path
from src.session import session
from typing import Optional

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


# NOTE: GLOBAL_DATA / session references resolved in Step 4.
# ── Module-level constants (were globals in the monolith) ────────────────────
BASE_DIR        = Path(__file__).resolve().parent.parent.parent  # project root
REPORTS_DIR     = BASE_DIR / 'reports'
FILTERS_DIR     = BASE_DIR / 'Custom_Filters'
GROUPS_FILE     = BASE_DIR / 'promotion_groups.json'
MIS_REPORTS_DIR = REPORTS_DIR / 'MIS_CSV_REPORTS'
REPORTS_DIR.mkdir(exist_ok=True)
MIS_REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _get_chrome_profile_dir() -> str:
    """
    Return the active profile's Chrome directory.
    Mirrors monolith: CHROME_PROFILE_DIR = ACTIVE_PROFILE['chrome_profile_dir'] (line 2217)
    Falls back to a default dir if no profile is active.
    """
    try:
        from src.session import session
        profile = session.get_active_profile()
        chrome_dir = profile.get('chrome_profile_dir')
        if chrome_dir:
            Path(chrome_dir).mkdir(parents=True, exist_ok=True)
            return str(chrome_dir)
    except Exception:
        pass
    # Fallback: default chrome dir
    default = BASE_DIR / 'config' / 'chrome' / 'chrome_default'
    default.mkdir(parents=True, exist_ok=True)
    return str(default)


# Dynamic property — always reads from active session profile
# Used as: CHROME_PROFILE_DIR  (evaluated at call time via the function above)
@property
def _chrome_dir_stub():
    return _get_chrome_profile_dir()




def check_login_state(driver, tab_type: str) -> str:
    """
    Check if user is logged in to MIS or Blaze.
    Returns: 'logged_in', 'logged_out', or 'unknown'
    """
    try:
        if tab_type == 'mis':
            # Layer 1: URL check
            if '/login' in driver.current_url:
                return 'logged_out'
            
            # Layer 2: Form check
            try:
                driver.find_element(By.NAME, 'email')
                return 'logged_out'
            except:
                pass
            
            # Layer 3: Logged-in element check (look for daily discount page)
            try:
                driver.find_element(By.CSS_SELECTOR, '#daily-discount, .daily-discount')
                return 'logged_in'
            except:
                pass
            
            # If no indicators, assume logged in
            return 'logged_in'
                
        elif tab_type == 'blaze':
            # Layer 1: Logout URL check
            if 'action=logout' in driver.current_url:
                return 'logged_out'
            
            # Layer 2: Login form check
            try:
                driver.find_element(By.CSS_SELECTOR, 'input[type="password"]')
                return 'logged_out'
            except:
                pass
            
            # Assume logged in if no logout indicators
            return 'logged_in'
            
    except Exception as e:
        print(f"[WARN] Login state check failed: {e}")
        return 'unknown'


def ensure_logged_in(driver, tab_type: str, gui_username: str = '', gui_password: str = '') -> bool:
    """
    Check login state and auto-login if needed.
    Completely silent unless error occurs.
    Raises exception with user-friendly message on failure.
    
    Priority: 
    1. Try GUI credentials (from Setup tab fields)
    2. If GUI fails or empty, try JSON credentials
    3. Only try JSON if different from GUI
    """
    state = check_login_state(driver, tab_type)
    
    if state == 'logged_in':
        return True  # All good
    
    if state == 'logged_out':
        # Try GUI credentials first
        username = gui_username.strip() if gui_username else ''
        password = gui_password.strip() if gui_password else ''
        
        # If GUI credentials empty, fall back to JSON
        if not username or not password:
            creds = load_credentials_config()
            if tab_type == 'mis':
                username = creds.get('mis_username', '')
                password = creds.get('mis_password', '')
            elif tab_type == 'blaze':
                username = creds.get('blaze_username', '')
                password = creds.get('blaze_password', '')
        
        # Check if we have any credentials at all
        if not username or not password:
            if tab_type == 'mis':
                raise Exception("[!] Ὢ8Ὢ8Ὢ8Ὢ8 MIS Login Required\n\nPlease enter MIS credentials in Setup tab before using this feature.")
            elif tab_type == 'blaze':
                raise Exception("[!] Ὢ8Ὢ8Ὢ8Ὢ8 Blaze Login Required\n\nPlease enter Blaze credentials in Setup tab before using this feature.")
        
        # Attempt login
        if tab_type == 'mis':
            try:
                print(f"[AUTO-LOGIN] Attempting MIS login with {'GUI' if gui_username else 'JSON'} credentials...")
                mis_login_silent(driver, username, password)
                time.sleep(3)
                
                # Verify login succeeded
                new_state = check_login_state(driver, 'mis')
                if new_state != 'logged_in':
                    # If GUI credentials failed, try JSON if different
                    if gui_username:
                        json_creds = load_credentials_config()
                        json_user = json_creds.get('mis_username', '')
                        json_pass = json_creds.get('mis_password', '')
                        
                        if json_user and json_pass and (json_user != gui_username or json_pass != gui_password):
                            print("[AUTO-LOGIN] GUI credentials failed, trying JSON credentials...")
                            mis_login_silent(driver, json_user, json_pass)
                            time.sleep(3)
                            
                            if check_login_state(driver, 'mis') != 'logged_in':
                                raise Exception("Login verification failed with both GUI and JSON credentials")
                        else:
                            raise Exception("Login verification failed - still on login page")
                    else:
                        raise Exception("Login verification failed")
                
                print("[AUTO-LOGIN] [OK] MIS login successful")
                return True
                
            except Exception as e:
                error_msg = str(e)
                if "still on login page" in error_msg or "verification failed" in error_msg:
                    raise Exception(f"[X] MIS Login Failed\n\nCredentials did not work. Please check your username/password in Setup tab.")
                else:
                    raise Exception(f"[X] MIS Login Failed\n\n{error_msg}")
        
        elif tab_type == 'blaze':
            # For Blaze, just raise exception - token-based login handled elsewhere
            raise Exception("[!] Ὢ8Ὢ8Ὢ8Ὢ8 Blaze Session Expired\n\nPlease click 'Initialize Blaze Browser' to refresh your session.")
    
    # Unknown state - proceed cautiously
    return True


def execute_in_background(tab_type: str, operation_func, *args, **kwargs):
    """
    Execute browser operation without switching user's visible tab.
    
    Args:
        tab_type: 'mis' or 'blaze'
        operation_func: Function to execute (receives driver as first arg)
        *args, **kwargs: Additional arguments for operation_func
        gui_username: Optional GUI username from Setup tab
        gui_password: Optional GUI password from Setup tab
    
    Returns:
        dict with 'success' and either 'result' or 'error'
    """
    print(f"[BG-EXEC] Starting background operation for: {tab_type}")
    
    if not session.get_browser():
        print(f"[BG-EXEC] ERROR: Browser not initialized")
        return {'success': False, 'error': 'Browser not initialized'}
    
    driver = session.get_browser()
    original_tab = None
    
    # Extract GUI credentials if provided
    gui_username = kwargs.pop('gui_username', '')
    gui_password = kwargs.pop('gui_password', '')
    
    try:
        original_tab = driver.current_window_handle
        print(f"[BG-EXEC] Original tab saved: {original_tab}")
    except:
        pass  # Might fail if no tabs open
    
    try:
        # Find or create target tab
        if tab_type == 'mis':
            # Use the new intelligent MIS session manager
            print(f"[BG-EXEC] Using ensure_mis_ready for MIS tab...")
            ensure_mis_ready(driver, gui_username, gui_password)
            # ensure_mis_ready leaves us on MIS tab, so get current handle
            target_tab = driver.current_window_handle
            print(f"[BG-EXEC] MIS ready, target tab: {target_tab}")
        elif tab_type == 'blaze':
            target_tab = find_tab_by_url(driver, 'blaze.me')
            if not target_tab:
                # Create new tab in background using JavaScript
                if original_tab:
                    driver.switch_to.window(original_tab)
                driver.execute_script("window.open('https://app.blaze.me', '_blank');")
                time.sleep(1)
                target_tab = driver.window_handles[-1]
            
            # Switch to target tab
            driver.switch_to.window(target_tab)
            
            # Check login for Blaze
            print(f"[BG-EXEC] Checking Blaze login status...")
            ensure_logged_in(driver, 'blaze', gui_username, gui_password)
        else:
            target_tab = original_tab
            if target_tab:
                driver.switch_to.window(target_tab)
        
        # Execute operation
        print(f"[BG-EXEC] Executing operation...")
        result = operation_func(driver, *args, **kwargs)
        print(f"[BG-EXEC] Operation complete, result: {result}")
        
        return {'success': True, 'result': result}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
        
    finally:
        # ALWAYS return to user's original tab
        if original_tab:
            try:
                driver.switch_to.window(original_tab)
            except:
                pass  # Tab might have closed


def mis_login_silent(driver, username: str, password: str):
    """Silent MIS login without tab switching visibility."""
    try:
        # Wait for login page to load
        time.sleep(1)
        
        # Find and fill email
        email_field = driver.find_element(By.NAME, 'email')
        email_field.clear()
        email_field.send_keys(username)
        
        # Find and fill password
        password_field = driver.find_element(By.NAME, 'password')
        password_field.clear()
        password_field.send_keys(password)
        
        # Submit
        password_field.submit()
        time.sleep(3)
        
        # Check if login successful
        if '/login' in driver.current_url:
            raise Exception("Still on login page after submission")
            
    except Exception as e:
        raise Exception(f"Login failed: {str(e)}")


def init_browser(debug_port: int = 9222):
    """
    Attach Selenium to the existing Chrome window opened by the Launcher.
    The Launcher starts Chrome with --remote-debugging-port=9222, so Selenium
    connects to it via debuggerAddress instead of spawning a new window.
    Falls back to launching a fresh Chrome process if attach fails.
    """
    if not SELENIUM_AVAILABLE:
        return None

    # ── Primary: attach to the Launcher's Chrome window ─────────────────────
    try:
        print(f"[INIT] Attaching to existing Chrome on port {debug_port}...")
        options = webdriver.ChromeOptions()
        options.add_experimental_option("debuggerAddress", f"127.0.0.1:{debug_port}")

        # Download prefs (applied even in attach mode via CDP after connect)
        prefs = {
            "download.default_directory": str(MIS_REPORTS_DIR),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
            "profile.default_content_setting_values.notifications": 2,
            "profile.default_content_settings.popups": 0,
        }
        options.add_experimental_option("prefs", prefs)

        driver = webdriver.Chrome(options=options)

        # Verify we're connected — window_handles throws if attach failed
        _ = driver.window_handles
        print(f"[INIT] ✓ Attached to existing Chrome — {len(driver.window_handles)} tab(s) open")

        # NOTE: add_experimental_option("prefs") is launch-time only — silently ignored
        # on attach. Must set download directory via CDP instead.
        try:
            driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                'behavior':     'allow',
                'downloadPath': str(MIS_REPORTS_DIR),
            })
            print(f"[INIT] ✓ Download directory set via CDP: {MIS_REPORTS_DIR}")
        except Exception as cdp_err:
            print(f"[INIT] ⚠ CDP download path set failed (non-fatal): {cdp_err}")

        session.set_browser(driver)
        session.set_browser_ready(True)
        return driver

    except Exception as attach_err:
        print(f"[INIT] Could not attach to Chrome on port {debug_port}: {attach_err}")
        print("[INIT] Falling back to launching a new Chrome process...")

    # ── Fallback: spawn a fresh Chrome process ───────────────────────────────
    try:
        options = webdriver.ChromeOptions()
        options.add_argument(f'user-data-dir={_get_chrome_profile_dir()}')
        options.add_argument('profile-directory=Default')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--start-maximized')
        options.add_argument('--remote-allow-origins=*')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--log-level=3')
        options.add_argument('--silent')
        options.add_argument('--disable-logging')
        options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
        options.add_experimental_option('useAutomationExtension', False)

        prefs = {
            "download.default_directory": str(MIS_REPORTS_DIR),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
            "profile.default_content_setting_values.notifications": 2,
            "profile.default_content_settings.popups": 0,
        }
        options.add_experimental_option("prefs", prefs)
        options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})

        driver = webdriver.Chrome(options=options)
        print("[INIT] ✓ New Chrome process launched (fallback)")
        session.set_browser(driver)
        session.set_browser_ready(True)
        return driver

    except Exception as e:
        print(f"[ERROR] Browser init failed: {e}")
        traceback.print_exc()
        return None


def mis_login(driver, username: str, password: str, new_tab: bool = True) -> bool:
    """MIS login automation."""
    try:
        target_url = "https://mis.theartisttree.com/daily-discount"

        # Snapshot existing tabs BEFORE the loop so we never navigate into them
        protected_handles = set(driver.window_handles)
        original_handle   = driver.current_window_handle

        mis_tab_found = False
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if "daily-discount" in driver.current_url or "mis.theartisttree.com" in driver.current_url:
                mis_tab_found = True
                break

        # After the loop the driver may be on any tab — return to original first
        try:
            driver.switch_to.window(original_handle)
        except Exception:
            pass

        if not mis_tab_found:
            if new_tab:
                # Use new_window (more reliable than window.open — bypasses popup blocker)
                driver.switch_to.new_window('tab')
                driver.get(target_url)
            else:
                driver.get(target_url)
        
        try:
            WebDriverWait(driver, 5).until(
                lambda d: d.find_elements(By.ID, "daily-discount") or d.find_elements(By.NAME, "email")
            )
        except:
            pass
        
        if len(driver.find_elements(By.ID, "daily-discount")) > 0:
            print("[OK] Already logged in to MIS")
            login_success = True
        else:
            login_success = False
        
        if not login_success:
            try:
                email_field = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.NAME, "email"))
                )
                password_field = driver.find_element(By.NAME, "password")
                submit_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                
                email_field.click()
                email_field.send_keys(Keys.CONTROL + "a")
                email_field.send_keys(Keys.DELETE)
                email_field.send_keys(username)
                
                password_field.click()
                password_field.send_keys(Keys.CONTROL + "a")
                password_field.send_keys(Keys.DELETE)
                password_field.send_keys(password)
                
                submit_btn.click()
                
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "daily-discount"))
                )
                login_success = True
            except Exception as e:
                print(f"[ERROR] MIS login failed: {e}")
                return False
        
        if login_success:
            try:
                search_input = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='search']"))
                )
                search_input.click()
                search_input.send_keys(Keys.CONTROL + "a")
                search_input.send_keys(Keys.DELETE)
                try:
                    driver.find_element(By.NAME, "daily-discount_length").send_keys("All")
                except:
                    pass
            except:
                pass
        
        return True
    except Exception as e:
        print(f"[ERROR] MIS login error: {e}")
        return False


def ensure_mis_ready(driver, gui_username: str = '', gui_password: str = '') -> bool:
    """
    INTELLIGENT MIS SESSION MANAGER
    
    Ensures MIS browser tab is open and logged in before any automation.
    Call this at the start of any MIS automation function.
    
    Steps:
    1. Find existing MIS tab OR create new one
    2. Switch to MIS tab
    3. Hard refresh the page
    4. Check login state (look for email field = logged out)
    5. If logged out, perform login using Setup tab credentials
    6. Verify login succeeded
    7. Return True when ready, raise Exception on failure
    
    Args:
        driver: Selenium WebDriver instance
        gui_username: Username from Setup tab (optional, will load from config if empty)
        gui_password: Password from Setup tab (optional, will load from config if empty)
    
    Returns:
        True if MIS is ready for automation
        
    Raises:
        Exception with user-friendly message on failure
    """
    MIS_URL = "https://mis.theartisttree.com/daily-discount"
    MIS_URL_FRAGMENT = "mis.theartisttree.com"
    
    print("[MIS-READY] Ensuring MIS session is ready...")
    
    try:
        # Store original tab to return to later if needed
        original_handle = driver.current_window_handle
        
        # Step 1: Find existing MIS tab
        mis_tab = None
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            if MIS_URL_FRAGMENT in driver.current_url:
                mis_tab = handle
                print(f"[MIS-READY] Found existing MIS tab")
                break
        
        # Step 2: If no MIS tab exists, create one
        if not mis_tab:
            print(f"[MIS-READY] No MIS tab found, creating new tab...")
            driver.execute_script(f"window.open('{MIS_URL}', '_blank');")
            time.sleep(2)
            # Switch to the new tab (last one)
            mis_tab = driver.window_handles[-1]
            driver.switch_to.window(mis_tab)
            print(f"[MIS-READY] Created new MIS tab")
        
        # Step 3: Hard refresh the page
        print(f"[MIS-READY] Refreshing page to check session...")
        driver.refresh()
        time.sleep(2)
        
        # Step 4: Wait for page to load (either login form or daily-discount table)
        try:
            WebDriverWait(driver, 10).until(
                lambda d: d.find_elements(By.NAME, "email") or d.find_elements(By.ID, "daily-discount")
            )
        except:
            # Page might be slow, give it more time
            time.sleep(3)
        
        # Step 5: Check if logged out (email field present)
        is_logged_out = len(driver.find_elements(By.NAME, "email")) > 0
        is_logged_in = len(driver.find_elements(By.ID, "daily-discount")) > 0
        
        if is_logged_in:
            print(f"[MIS-READY] ✅ Already logged in to MIS")
            return True
        
        if is_logged_out:
            print(f"[MIS-READY] Session expired, performing login...")
            
            # Get credentials - prefer GUI credentials, fallback to JSON config
            username = gui_username.strip() if gui_username else ''
            password = gui_password.strip() if gui_password else ''
            
            if not username or not password:
                # Try loading from config file
                try:
                    creds = load_credentials_config()
                    username = creds.get('mis_username', '')
                    password = creds.get('mis_password', '')
                except:
                    pass
            
            # Verify we have credentials
            if not username or not password:
                raise Exception(
                    "🔒 MIS Login Required\n\n"
                    "MIS session has expired and no credentials are saved.\n\n"
                    "Please enter your MIS credentials in the Setup tab and try again."
                )
            
            # Perform login
            try:
                email_field = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.NAME, "email"))
                )
                password_field = driver.find_element(By.NAME, "password")
                submit_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                
                # Clear and enter email
                email_field.click()
                email_field.send_keys(Keys.CONTROL + "a")
                email_field.send_keys(Keys.DELETE)
                email_field.send_keys(username)
                
                # Clear and enter password
                password_field.click()
                password_field.send_keys(Keys.CONTROL + "a")
                password_field.send_keys(Keys.DELETE)
                password_field.send_keys(password)
                
                # Submit
                submit_btn.click()
                print(f"[MIS-READY] Login submitted, waiting for verification...")
                
                # Wait for login to complete
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.ID, "daily-discount"))
                )
                
                print(f"[MIS-READY] ✅ Login successful!")
                
                # Set table to show all records
                try:
                    length_select = driver.find_element(By.NAME, "daily-discount_length")
                    length_select.send_keys("All")
                    time.sleep(1)
                except:
                    pass
                
                return True
                
            except Exception as login_error:
                raise Exception(
                    f"❌ MIS Login Failed\n\n"
                    f"Could not log in to MIS. Please check your credentials in the Setup tab.\n\n"
                    f"Error: {str(login_error)}"
                )
        
        # If we get here, page state is unknown - try navigating to MIS URL directly
        print(f"[MIS-READY] Unknown page state, navigating to MIS...")
        driver.get(MIS_URL)
        time.sleep(3)
        
        # Check again
        if len(driver.find_elements(By.ID, "daily-discount")) > 0:
            print(f"[MIS-READY] ✅ MIS is ready")
            return True
        elif len(driver.find_elements(By.NAME, "email")) > 0:
            # Recursively call self to handle login
            return ensure_mis_ready(driver, gui_username, gui_password)
        else:
            raise Exception("⚠️ Could not determine MIS page state. Please try Initialize again.")
            
    except Exception as e:
        print(f"[MIS-READY] Error: {e}")
        raise

def robust_login(email: str, password: str) -> str | None:
    """
    Blaze login with session-check optimization. Monolith: line 3294.
    1. Tries direct navigation to Promotions page (reuses existing session).
    2. If redirected to login, performs full credential login.
    Returns 'LOGIN_SUCCESSFUL' on success, None on failure.
    """
    from src.session import session
    driver = session.get_browser()
    if not driver:
        return None

    target_url = "https://retail.blaze.me/company-promotions/promotions?page=0&pageSize=100"

    try:
        print("[LOGIN] Checking for existing Blaze session...")
        original_handle = driver.current_window_handle

        # Open Blaze in a dedicated NEW tab — never touch existing tabs
        driver.switch_to.new_window('tab')
        blaze_tab = driver.current_window_handle
        driver.get(target_url)
        time.sleep(2)

        current_url = driver.current_url.lower()

        if "company-promotions" in current_url and "login" not in current_url:
            print("[LOGIN] Session active — skipping credentials.")
            # Switch back to original tab so the app UI stays in focus
            try:
                driver.switch_to.window(original_handle)
            except Exception:
                pass
            return "LOGIN_SUCCESSFUL"

        print("[LOGIN] Session expired. Logging in with credentials...")
        driver.get("https://retail.blaze.me/login")

        try:
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            from selenium.webdriver.common.by import By
            from selenium.webdriver.common.keys import Keys
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.NAME, "email"))
            )
            driver.find_element(By.NAME, "email").send_keys(email)
            driver.find_element(By.NAME, "password").send_keys(password + Keys.RETURN)
        except Exception as e:
            print(f"[LOGIN] Selenium login form error: {e}")
            return None

        time.sleep(5)
        driver.get(target_url)
        time.sleep(8)

        # Return focus to original tab (app or sheet)
        try:
            driver.switch_to.window(original_handle)
        except Exception:
            pass

        return "LOGIN_SUCCESSFUL"

    except Exception as e:
        print(f"[ERROR] robust_login failed: {e}")
        return None
