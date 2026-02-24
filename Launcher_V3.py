#!/usr/bin/env python3
# Launcher_V3.py — TAT-MIS-Architect launcher
# ─────────────────────────────────────────────────────────────────────────────
# Responsibilities:
#   1. Inject secrets from BLAZE_MIS_CREDENTIALS.json into environment
#   2. Verify Python version (3.10+) and critical dependencies
#   3. Detect active profile and set PROFILE env var
#   4. Launch Flask server (run.py) and open browser
#   5. Log startup to reports/launcher.log
#
# Usage:
#   python Launcher_V3.py [--profile TAT] [--port 5000] [--no-browser]
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import webbrowser
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

# ── Ensure project root on path ───────────────────────────────────────────────
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ── Logging setup ─────────────────────────────────────────────────────────────
def _setup_log() -> Path:
    log_dir = PROJECT_ROOT / 'reports'
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / 'launcher.log'


def _log(msg: str, log_path: Path | None = None) -> None:
    ts      = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    stamped = f"[{ts}] {msg}"
    print(stamped)
    if log_path:
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(stamped + '\n')


# ── Python version check ──────────────────────────────────────────────────────
def _check_python() -> None:
    if sys.version_info < (3, 10):
        sys.exit(
            f"ERROR: Python 3.10+ required. Current: {sys.version_info.major}.{sys.version_info.minor}"
        )


# ── Dependency check + auto-install ──────────────────────────────────────────
# Tuples of (import_name, pip_install_name)
REQUIRED_PACKAGES = [
    ('flask',                   'flask>=3.0'),
    ('pandas',                  'pandas>=2.0'),
    ('google.oauth2',           'google-auth>=2.0'),
    ('google_auth_oauthlib',    'google-auth-oauthlib>=1.0'),
    ('googleapiclient',         'google-api-python-client>=2.0'),
    ('selenium',                'selenium>=4.15'),
    ('undetected_chromedriver', 'undetected-chromedriver>=3.5'),
    ('psutil',                  'psutil>=5.9'),
    ('rapidfuzz',               'rapidfuzz>=3.0'),
    ('requests',                'requests>=2.31'),
]


def _check_deps(log: Path) -> None:
    """
    Check for missing packages and auto-install them via pip.
    Runs silently if everything is present.
    Exits with a clear message if pip itself fails.
    """
    import importlib
    missing_pip = []

    for import_name, pip_spec in REQUIRED_PACKAGES:
        try:
            importlib.import_module(import_name)
        except ImportError:
            missing_pip.append(pip_spec)

    if not missing_pip:
        _log("Dependencies: all present", log)
        return

    _log(f"Auto-installing {len(missing_pip)} missing package(s): {', '.join(missing_pip)}", log)

    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'install', '--quiet', '--upgrade'] + missing_pip,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        _log("ERROR: pip install failed. Install manually then re-run.", log)
        _log(result.stderr.strip(), log)
        sys.exit(1)

    # Invalidate importlib caches so newly installed packages are visible
    import importlib.util
    importlib.invalidate_caches()

    _log("Dependencies installed successfully.", log)


# ── Credentials injection ─────────────────────────────────────────────────────
def _inject_credentials(log: Path) -> None:
    """
    Load BLAZE_MIS_CREDENTIALS.json and inject values into os.environ.
    The JSON should contain any keys you want available as env vars.
    Example:
        {
          "GOOGLE_CLIENT_ID": "...",
          "GOOGLE_CLIENT_SECRET": "...",
          "BLAZE_API_KEY": "..."
        }
    """
    creds_candidates = [
        PROJECT_ROOT / 'BLAZE_MIS_CREDENTIALS.json',
        PROJECT_ROOT / 'config' / 'BLAZE_MIS_CREDENTIALS.json',
    ]
    for creds_path in creds_candidates:
        if creds_path.exists():
            try:
                with open(creds_path) as f:
                    creds = json.load(f)
                injected = 0
                for key, val in creds.items():
                    if key.startswith('_'):  # skip comment keys
                        continue
                    if key not in os.environ:   # don't overwrite existing env
                        os.environ[key] = str(val)
                        injected += 1
                _log(f"Credentials injected: {injected} key(s) from {creds_path.name}", log)
                return
            except Exception as e:
                _log(f"WARN: Could not load credentials: {e}", log)
                return

    _log("INFO: No BLAZE_MIS_CREDENTIALS.json found — using existing env", log)


# ── Profile detection ─────────────────────────────────────────────────────────
def _detect_profile(requested: str | None) -> str | None:
    """
    Return the profile handle to activate.
    Priority: --profile arg > BLAZE_PROFILE env > last_profile.json > first token found > None.

    Mirrors the logic in src/api/profiles.py::auto_select_profile() so the launcher
    and Flask agree on the active profile before the server starts.
    """
    if requested:
        return requested

    env_profile = os.environ.get('BLAZE_PROFILE', '').strip()
    if env_profile:
        return env_profile

    # Mirror profiles.py: profiles are identified by config/tokens/token_{handle}.json
    tokens_dir  = PROJECT_ROOT / 'config' / 'tokens'
    creds_dir   = PROJECT_ROOT / 'config' / 'google_creds'
    last_file   = PROJECT_ROOT / 'config' / 'last_profile.json'

    def _has_credentials(handle: str) -> bool:
        return (creds_dir / f'credentials_{handle}.json').exists()

    def _available_profiles() -> list[str]:
        if not tokens_dir.exists():
            return []
        return sorted(
            tf.stem.replace('token_', '')
            for tf in tokens_dir.glob('token_*.json')
            if tf.stem.replace('token_', '')
        )

    # 1. last_profile.json (same priority as Flask's auto_select_profile)
    if last_file.exists():
        try:
            last = json.loads(last_file.read_text()).get('last_profile', '').strip()
            profiles = _available_profiles()
            if last and last in profiles and _has_credentials(last):
                return last
        except Exception:
            pass

    # 2. First profile that has both a token and credentials
    for handle in _available_profiles():
        if _has_credentials(handle):
            return handle

    # 3. First profile with a token (credentials may be missing — Flask will handle the error)
    profiles = _available_profiles()
    if profiles:
        return profiles[0]

    return None


# ── Port availability check ───────────────────────────────────────────────────
def _port_is_free(port: int) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(('127.0.0.1', port)) != 0



# ── Chrome executable finder ─────────────────────────────────────────────────

def _find_chrome() -> str | None:
    """
    Locate the Chrome executable on Windows, macOS, or Linux.
    Returns the full path string, or None if not found.
    """
    import platform
    system = platform.system()

    if system == 'Windows':
        candidates = [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            Path.home() / 'AppData' / 'Local' / 'Google' / 'Chrome' / 'Application' / 'chrome.exe',
        ]
    elif system == 'Darwin':  # macOS
        candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            Path.home() / 'Applications' / 'Google Chrome.app' / 'Contents' / 'MacOS' / 'Google Chrome',
        ]
    else:  # Linux
        candidates = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium',
        ]

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return str(path)

    return None


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description='BLAZE MIS Audit Pro — Launcher V3')
    parser.add_argument('--profile',    default=None, help='Profile name (e.g. TAT)')
    parser.add_argument('--port',       type=int, default=5000, help='Flask port (default 5000)')
    parser.add_argument('--host',       default='127.0.0.1', help='Bind host (default 127.0.0.1)')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser after start')
    parser.add_argument('--debug',      action='store_true', help='Enable Flask debug mode')
    args = parser.parse_args()

    log = _setup_log()
    _log('=' * 60, log)
    _log('BLAZE MIS Audit Pro — TAT-MIS-Architect Launcher V3', log)
    _log(f'Python {sys.version.split()[0]}  |  PID {os.getpid()}', log)
    _log('=' * 60, log)

    # 1. Python version
    _check_python()

    # 2. Inject credentials
    _inject_credentials(log)

    # 3. Detect profile
    profile = _detect_profile(args.profile)
    if profile:
        os.environ['BLAZE_PROFILE'] = profile
        _log(f"Active profile: {profile}", log)
    else:
        _log("No profile detected — running without profile context", log)

    # 4. Dependency check (non-fatal)
    _check_deps(log)

    # 5. Port check
    port = args.port
    if not _port_is_free(port):
        _log(f"WARN: Port {port} is in use. Trying {port + 1}...", log)
        port += 1
        if not _port_is_free(port):
            sys.exit(f"ERROR: Ports {args.port} and {port} are both in use.")

    # 6. Set environment for run.py
    os.environ['FLASK_HOST']  = args.host
    os.environ['FLASK_PORT']  = str(port)
    os.environ['FLASK_DEBUG'] = '1' if args.debug else '0'

    url = f"http://{args.host}:{port}"
    _log(f"Starting Flask server: {url}", log)

    # 7. Open dedicated Chrome app window (with delay to let server start)
    if not args.no_browser:
        chrome_profile_dir = PROJECT_ROOT / 'config' / 'chrome' / 'chrome_launcher_ui'
        chrome_profile_dir.mkdir(parents=True, exist_ok=True)

        def _open_chrome_app(url: str, profile_dir: Path, log_path: Path) -> None:
            time.sleep(2.5)
            chrome_exe = _find_chrome()
            if chrome_exe:
                _log(f"Opening Chrome app window: {chrome_exe}", log_path)
                subprocess.Popen([
                    chrome_exe,
                    f'--user-data-dir={profile_dir}',  # Isolated profile — own window, own cookies
                    '--new-window',                     # Force a new window (not a tab in existing Chrome)
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-extensions',
                    '--window-size=1400,900',
                    '--remote-debugging-port=9222',     # Allow Selenium to attach to this window
                    url,                               # URL as final positional arg
                ])
            else:
                _log("WARN: Chrome not found — falling back to default browser", log_path)
                webbrowser.open(url)

        import threading
        threading.Thread(
            target=_open_chrome_app,
            args=(url, chrome_profile_dir, log),
            daemon=False
        ).start()
        _log(f"Chrome app window will open: {url}", log)

    # 8. Launch Flask (blocks until shutdown)
    # NOTE: os.execv replaces the process on Unix but behaves differently on Windows
    # and kills daemon threads before they fire. subprocess.run is cross-platform safe.
    run_py = PROJECT_ROOT / 'run.py'
    try:
        proc = subprocess.run(
            [sys.executable, str(run_py)],
            env=os.environ.copy(),
        )
        sys.exit(proc.returncode)
    except KeyboardInterrupt:
        _log("Shutting down.", log)
    except Exception as e:
        _log(f"ERROR launching run.py: {e}", log)
        sys.exit(1)


if __name__ == '__main__':
    main()
