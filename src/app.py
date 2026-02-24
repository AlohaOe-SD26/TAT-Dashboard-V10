# src/app.py — v2.0
# Flask application factory. Registers all Blueprints.
# Import create_app() from here — never instantiate Flask directly in route files.

from __future__ import annotations
import json
import traceback
from pathlib import Path

from flask import Flask


def create_app(config_override: dict | None = None) -> Flask:
    """
    Application factory. Creates and configures the Flask app.
    Wires: config → SessionManager → active profile → Blueprints.

    Args:
        config_override: Optional dict to override settings (useful for testing).
    """
    app = Flask(
        __name__,
        template_folder=str(Path(__file__).resolve().parent.parent / 'templates'),
        static_folder=str(Path(__file__).resolve().parent.parent / 'static'),
    )

    _load_config(app, config_override)

    from src.session import init_session
    init_session(app)

    _init_active_profile()
    _register_blueprints(app)

    return app


# ── Private helpers ───────────────────────────────────────────────────────────

def _load_config(app: Flask, override: dict | None) -> None:
    """Load settings.json → app.config, then apply any overrides."""
    settings_path = Path(__file__).resolve().parent.parent / 'config' / 'settings.json'
    if settings_path.exists():
        try:
            with open(settings_path, 'r') as f:
                raw = json.load(f)
            # Strip comment keys (keys starting with '_')
            app.config.update({k: v for k, v in raw.items() if not k.startswith('_')})
        except Exception as e:
            print(f"[APP] settings.json load warning: {e}")

    if override:
        app.config.update(override)


def _init_active_profile() -> None:
    """
    Run profile auto-selection and persist result into SessionManager.
    Priority: BLAZE_PROFILE env → last_profile.json → first valid → first-run mode.
    Non-fatal: app still starts even with no profiles registered.
    """
    try:
        from src.api.profiles import auto_select_profile
        from src.session import session

        profile = auto_select_profile()
        session.set_active_profile(profile)

        handle = profile.get('handle')
        if handle:
            print(f"[APP] Active profile: {handle}")
            print(f"[APP] Token:          config/tokens/token_{handle}.json")
            print(f"[APP] Chrome dir:     config/chrome/chrome_{handle}/")

            # Wire profile paths into google_sheets module globals
            # (mirrors monolith line 2215: TOKEN_FILE = ACTIVE_PROFILE['token_file'])
            try:
                from src.integrations.google_sheets import configure_google_sheets_profile
                configure_google_sheets_profile(
                    token_file=profile.get('token_file'),
                    credentials_file=profile.get('credentials_file'),
                )
            except Exception as gs_err:
                print(f"[APP] google_sheets profile wire warning (non-fatal): {gs_err}")
        else:
            print("[APP] No profile found — first-run mode")
            print("[APP] Register a profile via POST /api/profile/register")
    except Exception as e:
        print(f"[APP] Profile init warning (non-fatal): {e}")


def _register_blueprints(app: Flask) -> None:
    """Register all API Blueprints with per-blueprint error isolation."""
    import importlib

    BLUEPRINTS = [
        ('src.api.profiles',       'profiles'),
        ('src.api.mis_matcher',    'mis_matcher'),
        ('src.api.mis_updown',     'mis_updown'),
        ('src.api.mis_audit',      'mis_audit'),
        ('src.api.mis_automation', 'mis_automation'),
        ('src.api.blaze',          'blaze'),
    ]

    for mod_path, name in BLUEPRINTS:
        try:
            mod = importlib.import_module(mod_path)
            app.register_blueprint(getattr(mod, 'bp'))
            print(f"[APP] ✓ {name}")
        except Exception:
            print(f"[APP] ✗ {name} (blueprint failed to load — see traceback)")
            traceback.print_exc()

    # ── Routes defined inline (lightweight, no blueprint overhead) ────────────
    from flask import render_template, jsonify

    @app.route('/')
    def index():  # type: ignore[misc]
        return render_template('index.html')

    @app.route('/health')
    def health():  # type: ignore[misc]
        from src.session import session
        return jsonify({
            'status':        'ok',
            'version':       app.config.get('VERSION', 'v12.4'),
            'profile':       session.get_active_handle(),
            'browser_ready': session.is_browser_ready(),
            'spreadsheet':   bool(session.get_spreadsheet_id()),
        })
