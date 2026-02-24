# src/api/profiles.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# Profile management: list, switch, register, delete, auth.
# Migrated from monolith lines 23975–24200.
#
# Profile anatomy:
#   config/google_creds/  credentials_{handle}.json  ← OAuth client secret
#   config/tokens/        token_{handle}.json         ← OAuth access token
#   config/blaze_configs/ blaze_config_{handle}.json  ← Blaze/MIS creds
#   config/chrome/        chrome_{handle}/            ← Chrome profile dir
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import os
import re
import traceback
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint('profiles', __name__)

# ── Path helpers ──────────────────────────────────────────────────────────────
def _root() -> Path:
    return Path(__file__).resolve().parent.parent.parent

def _cfg() -> Path:
    return _root() / 'config'

def _tokens_dir() -> Path:
    d = _cfg() / 'tokens'; d.mkdir(parents=True, exist_ok=True); return d

def _creds_dir() -> Path:
    d = _cfg() / 'google_creds'; d.mkdir(parents=True, exist_ok=True); return d

def _blaze_dir() -> Path:
    d = _cfg() / 'blaze_configs'; d.mkdir(parents=True, exist_ok=True); return d

def _chrome_dir() -> Path:
    d = _cfg() / 'chrome'; d.mkdir(parents=True, exist_ok=True); return d

def _last_profile_file() -> Path:
    return _cfg() / 'last_profile.json'

# ── Core helpers ──────────────────────────────────────────────────────────────

def get_available_profiles() -> list[str]:
    return sorted(
        tf.stem.replace('token_', '')
        for tf in _tokens_dir().glob('token_*.json')
        if tf.stem.replace('token_', '')
    )

def check_credentials_for_handle(handle: str) -> bool:
    return (_creds_dir() / f'credentials_{handle}.json').exists()

def get_last_used_profile() -> str:
    f = _last_profile_file()
    try:
        return json.loads(f.read_text()).get('last_profile', '') if f.exists() else ''
    except Exception:
        return ''

def save_last_used_profile(handle: str) -> None:
    try:
        _last_profile_file().write_text(json.dumps({'last_profile': handle}))
    except Exception as e:
        print(f"[WARN] Could not save last profile: {e}")

def build_profile_config(handle: str | None) -> dict:
    if handle is None:
        return {
            'handle': None, 'credentials_file': None, 'token_file': None,
            'blaze_config_file': None,
            'chrome_profile_dir': str(_chrome_dir() / 'chrome_default'),
        }
    return {
        'handle':            handle,
        'credentials_file':  str(_creds_dir()  / f'credentials_{handle}.json'),
        'token_file':        str(_tokens_dir() / f'token_{handle}.json'),
        'blaze_config_file': str(_blaze_dir()  / f'blaze_config_{handle}.json'),
        'chrome_profile_dir': str(_chrome_dir() / f'chrome_{handle}'),
    }

def load_profile_credentials(handle: str | None) -> dict:
    """
    Load blaze_config_{handle}.json and normalize to flat format.

    Accepts both formats:
      Flat (new):   {"mis_username": "...", "mis_password": "...", "blaze_email": "...", ...}
      Nested (old): {"mis": {"username": "...", "password": "..."}, "blaze": {"email": "..."}, ...}

    Always returns flat format so callers never need to know which format is on disk.
    """
    if not handle:
        return {}
    cfg = _blaze_dir() / f'blaze_config_{handle}.json'
    try:
        raw = json.loads(cfg.read_text()) if cfg.exists() else {}
    except Exception:
        return {}

    # Already flat format — has any of the expected flat keys
    if any(k in raw for k in ('mis_username', 'mis_password', 'blaze_email', 'blaze_password')):
        return raw

    # Nested format (legacy / manually created) — normalize to flat
    normalized: dict = {}
    mis   = raw.get('mis',   {})
    blaze = raw.get('blaze', {})
    sheet = raw.get('google_sheet', {})

    if mis.get('username'):   normalized['mis_username']   = mis['username']
    if mis.get('password'):   normalized['mis_password']   = mis['password']
    if blaze.get('email'):    normalized['blaze_email']    = blaze['email']
    if blaze.get('password'): normalized['blaze_password'] = blaze['password']
    if sheet.get('default_url'): normalized['google_sheet_url'] = sheet['default_url']

    return normalized

def auto_select_profile() -> dict:
    """
    Startup profile auto-selection.
    Priority: BLAZE_PROFILE env → last_profile.json → first valid → None.
    """
    profiles = get_available_profiles()

    env_h = os.environ.get('BLAZE_PROFILE', '').strip().lower()
    if env_h and env_h in profiles and check_credentials_for_handle(env_h):
        print(f"[PROFILE] Env override: {env_h}")
        save_last_used_profile(env_h)
        return build_profile_config(env_h)

    last = get_last_used_profile()
    if last and last in profiles and check_credentials_for_handle(last):
        print(f"[PROFILE] Last used: {last}")
        return build_profile_config(last)

    for p in profiles:
        if check_credentials_for_handle(p):
            print(f"[PROFILE] First available: {p}")
            save_last_used_profile(p)
            return build_profile_config(p)

    print("[PROFILE] First-run mode — no profiles found")
    return build_profile_config(None)

def register_profile_api(handle: str) -> dict:
    handle = handle.strip().lower()
    if not handle:
        return {'success': False, 'error': 'Handle cannot be empty'}
    if not re.match(r'^[a-z0-9._-]+$', handle):
        return {'success': False, 'error': 'Handle: letters, numbers, dots, underscores, hyphens only'}
    if handle in get_available_profiles():
        return {'success': False, 'error': f'Profile "{handle}" already exists'}
    if not check_credentials_for_handle(handle):
        return {'success': False, 'error': 'credentials_not_found',
                'expected_path': str(_creds_dir() / f'credentials_{handle}.json')}

    # Bootstrap blaze config placeholder
    blaze_cfg = _blaze_dir() / f'blaze_config_{handle}.json'
    if not blaze_cfg.exists():
        blaze_cfg.write_text(json.dumps(
            {'mis_username': '', 'mis_password': '', 'blaze_email': '', 'blaze_password': ''},
            indent=2
        ))

    # Token placeholder registers the profile in the scanner
    tf = _tokens_dir() / f'token_{handle}.json'
    if not tf.exists():
        tf.write_text(json.dumps({'placeholder': True, 'handle': handle}))

    (_chrome_dir() / f'chrome_{handle}').mkdir(parents=True, exist_ok=True)
    print(f"[PROFILE] Registered: {handle}")
    return {'success': True, 'handle': handle, 'message': f'Profile "{handle}" registered.'}


# ── Routes ────────────────────────────────────────────────────────────────────

@bp.route('/api/profiles')
def get_profiles():
    try:
        from src.session import session
        active = session.get('active_profile_handle') or ''
        return jsonify({
            'success': True,
            'active_profile': active or None,
            'profiles': [
                {'handle': p, 'has_credentials': check_credentials_for_handle(p), 'is_active': p == active}
                for p in get_available_profiles()
            ],
        })
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/profile/current')
def get_current_profile():
    try:
        from src.session import session
        h = session.get('active_profile_handle') or ''
        return jsonify({'success': True, 'handle': h or None,
                        'has_credentials': check_credentials_for_handle(h) if h else False})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/profile/switch', methods=['POST'])
def switch_profile():
    try:
        from src.session import session
        data = request.get_json() or {}
        handle = data.get('handle', '').strip().lower()
        if not handle:
            return jsonify({'success': False, 'error': 'No handle provided'})
        if handle not in get_available_profiles():
            return jsonify({'success': False, 'error': f'Profile "{handle}" not found'})
        if not check_credentials_for_handle(handle):
            return jsonify({'success': False, 'error': f'Credentials missing for "{handle}"'})
        save_last_used_profile(handle)
        session.set('active_profile_handle', handle)
        return jsonify({'success': True, 'message': f'Switched to "{handle}". Restart recommended.',
                        'restart_required': True})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/profile/register', methods=['POST'])
def register_profile():
    try:
        data = request.get_json() or {}
        handle = data.get('handle', '')
        result = register_profile_api(handle)
        if result['success']:
            save_last_used_profile(handle.strip().lower())
        return jsonify(result)
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/profile/check-credentials/<handle>')
def check_credentials_route(handle: str):
    try:
        handle = handle.strip().lower()
        return jsonify({'success': True, 'exists': check_credentials_for_handle(handle),
                        'expected_path': str(_creds_dir() / f'credentials_{handle}.json')})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/profile/delete', methods=['POST'])
def delete_profile():
    try:
        from src.session import session
        handle = (request.get_json() or {}).get('handle', '').strip().lower()
        if not handle:
            return jsonify({'success': False, 'error': 'No handle provided'})
        active = session.get('active_profile_handle') or ''
        if handle == active:
            return jsonify({'success': False, 'error': 'Cannot delete the active profile'})
        tf = _tokens_dir() / f'token_{handle}.json'
        if tf.exists():
            tf.unlink()
        return jsonify({'success': True, 'message': f'Profile "{handle}" deleted'})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/auth/google', methods=['POST'])
def auth_google():
    try:
        from src.session import session
        from src.integrations.google_sheets import authenticate_google_sheets
        service = authenticate_google_sheets()
        if service:
            session.set_sheets_service(service)
            return jsonify({'success': True, 'message': 'Google Sheets authenticated'})
        return jsonify({'success': False, 'error': 'Authentication failed'})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/auth', methods=['POST'])  # Legacy JS alias
def auth_legacy():
    return auth_google()


@bp.route('/api/get-credentials')
def get_credentials():
    """
    Return credentials in nested format matching the UI's autoLoadCredentials() expectations.
    UI reads: creds.mis.username, creds.mis.password,
              creds.blaze.email, creds.blaze.password,
              creds.google_sheet.default_url
    """
    try:
        from src.session import session
        handle = session.get('active_profile_handle') or ''
        config = load_profile_credentials(handle)
        return jsonify({'success': True, 'credentials': {
            'mis': {
                'username': config.get('mis_username', ''),
                'password': config.get('mis_password', ''),
            },
            'blaze': {
                'email':    config.get('blaze_email', ''),
                'password': config.get('blaze_password', ''),
            },
            'google_sheet': {
                'default_url': config.get('google_sheet_url', ''),
            },
        }})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/save-profile-credentials', methods=['POST'])
def save_profile_credentials():
    try:
        from src.session import session
        handle = session.get('active_profile_handle') or ''
        if not handle:
            return jsonify({'success': False, 'error': 'No active profile'})
        data     = request.get_json() or {}
        cfg_file = _blaze_dir() / f'blaze_config_{handle}.json'
        existing: dict = {}
        try:
            if cfg_file.exists():
                existing = json.loads(cfg_file.read_text())
        except Exception:
            pass
        for key in ('mis_username', 'mis_password', 'blaze_email', 'blaze_password'):
            if key in data:
                existing[key] = data[key]
        cfg_file.write_text(json.dumps(existing, indent=2))
        return jsonify({'success': True})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})


@bp.route('/api/get-mis-reports-folder')
def get_mis_reports_folder():
    d = _root() / 'reports'
    d.mkdir(parents=True, exist_ok=True)
    return jsonify({'success': True, 'path': str(d)})


@bp.route('/api/open-mis-reports-folder')
def open_mis_reports_folder():
    try:
        import platform, subprocess
        folder = str(_root() / 'reports')
        cmds = {'Windows': ['explorer'], 'Darwin': ['open'], }
        cmd = cmds.get(platform.system(), ['xdg-open'])
        subprocess.Popen(cmd + [folder])
        return jsonify({'success': True})
    except Exception as e:
        traceback.print_exc(); return jsonify({'success': False, 'error': str(e)})
