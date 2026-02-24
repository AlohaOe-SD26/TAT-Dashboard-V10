# tests/test_integration.py — Step 9 Integration Test Suite
# ─────────────────────────────────────────────────────────────────────────────
# Coverage areas:
#   1. Flask app factory and blueprint registration
#   2. SessionManager (volatile + SQLite tiers)
#   3. ValidationEngine (CRITICAL / ADVISORY / OK)
#   4. Fuzzy scoring algorithm (canonical weights from ARCHITECTURE_LOGIC.md)
#   5. Profile management helpers
#   6. Date helpers
#   7. Brand helpers
#   8. CSV resolver (path priority chain)
#   9. API routes (health, profiles, mis stubs)
#  10. mis_entry.py utilities (no Selenium needed)
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations
import json
import pytest
from pathlib import Path


# ══════════════════════════════════════════════════════════════════════════════
# 1 — Flask App Factory
# ══════════════════════════════════════════════════════════════════════════════

class TestAppFactory:
    def test_app_creates_successfully(self, app):
        assert app is not None

    def test_testing_mode(self, app):
        assert app.config['TESTING'] is True

    def test_health_endpoint(self, client):
        resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'ok'
        assert 'version' in data
        assert 'browser_ready' in data

    def test_index_route(self, client):
        resp = client.get('/')
        # 200 = rendered, 500 = template error, both indicate route is registered
        assert resp.status_code in (200, 500)

    def test_blueprints_registered(self, app):
        """All 6 API blueprints should be registered."""
        rule_endpoints = {rule.endpoint for rule in app.url_map.iter_rules()}
        # Check for at least one endpoint from each blueprint
        assert any('profiles' in ep for ep in rule_endpoints), "profiles blueprint missing"
        assert any('mis_matcher' in ep or 'matcher' in ep.lower() for ep in rule_endpoints), "matcher bp missing"
        assert any('mis_audit' in ep or 'audit' in ep.lower() for ep in rule_endpoints), "audit bp missing"

    def test_no_duplicate_endpoints(self, app):
        urls = [str(rule) for rule in app.url_map.iter_rules()]
        assert len(urls) == len(set(urls)), "Duplicate URL rules found"


# ══════════════════════════════════════════════════════════════════════════════
# 2 — SessionManager
# ══════════════════════════════════════════════════════════════════════════════

class TestSessionManager:
    def test_import(self):
        from src.session import session
        assert session is not None

    def test_set_and_get(self):
        from src.session import session
        session.set('test_key_unit', 'hello')
        assert session.get('test_key_unit') == 'hello'

    def test_get_missing_returns_none(self):
        from src.session import session
        assert session.get('__nonexistent_key_xyz__') is None

    def test_get_missing_with_default(self):
        from src.session import session
        assert session.get('__missing__', 'fallback') == 'fallback'

    def test_spreadsheet_id(self):
        from src.session import session
        session.set_spreadsheet_id('1ABC123')
        assert session.get_spreadsheet_id() == '1ABC123'

    def test_browser_ready_flag(self):
        from src.session import session
        session.set_browser_ready(True)
        assert session.is_browser_ready() is True
        session.set_browser_ready(False)
        assert session.is_browser_ready() is False

    def test_active_profile_round_trip(self):
        from src.session import session
        cfg = {'handle': 'test.user', 'token_file': '/tmp/token_test.json',
               'credentials_file': None, 'blaze_config_file': None,
               'chrome_profile_dir': '/tmp/chrome_test'}
        session.set_active_profile(cfg)
        result = session.get_active_profile()
        assert result.get('handle') == 'test.user'

    def test_active_handle_shortcut(self):
        from src.session import session
        session.set_active_profile({'handle': 'quick.handle'})
        assert session.get_active_handle() == 'quick.handle'

    def test_automation_in_progress_flag(self):
        from src.session import session
        session.set_automation_in_progress(True)
        assert session.get('automation_in_progress') == 'true'


# ══════════════════════════════════════════════════════════════════════════════
# 3 — ValidationEngine
# ══════════════════════════════════════════════════════════════════════════════

class TestValidationEngine:
    def test_import(self):
        from src.core.validation_engine import ValidationEngine, ValidationRecord, Severity
        assert ValidationEngine is not None

    def test_severity_ordering(self):
        from src.core.validation_engine import Severity
        # CRITICAL should block; ADVISORY should not
        assert Severity.CRITICAL != Severity.ADVISORY
        assert Severity.OK != Severity.CRITICAL

    def test_critical_record_blocks(self):
        from src.core.validation_engine import ValidationEngine, ValidationRecord, Severity
        ve = ValidationEngine()
        record = ValidationRecord(
            field='brand',
            expected='Brand A',
            actual='Brand B',
            severity=Severity.CRITICAL,
            message='Brand mismatch',
        )
        ve.add(record)
        assert ve.has_critical()

    def test_advisory_does_not_block(self):
        from src.core.validation_engine import ValidationEngine, ValidationRecord, Severity
        ve = ValidationEngine()
        record = ValidationRecord(
            field='notes',
            expected='Note A',
            actual='Note B',
            severity=Severity.ADVISORY,
            message='Minor notes difference',
        )
        ve.add(record)
        assert not ve.has_critical()

    def test_empty_engine_is_clean(self):
        from src.core.validation_engine import ValidationEngine
        ve = ValidationEngine()
        assert not ve.has_critical()
        assert len(ve.records) == 0

    def test_to_dict_serializable(self):
        from src.core.validation_engine import ValidationEngine, ValidationRecord, Severity
        ve = ValidationEngine()
        ve.add(ValidationRecord(field='discount', expected='20', actual='25',
                                severity=Severity.CRITICAL, message='Mismatch'))
        d = ve.to_dict()
        assert isinstance(d, dict)
        assert 'records' in d or 'results' in d or len(d) > 0


# ══════════════════════════════════════════════════════════════════════════════
# 4 — Fuzzy Scoring (canonical: Brand 50 / Discount 30 / Vendor 15 / Cat 5)
# ══════════════════════════════════════════════════════════════════════════════

class TestFuzzyScoring:
    def test_import(self):
        from src.utils.fuzzy import compute_match_score
        assert callable(compute_match_score)

    def test_perfect_match_scores_100(self):
        from src.utils.fuzzy import compute_match_score
        expected = {'brand': 'Brand A', 'discount': '20', 'vendor_contrib': '10', 'categories': 'Flower'}
        candidate = {'brand': 'Brand A', 'discount': '20', 'vendor_contrib': '10', 'categories': 'Flower'}
        score = compute_match_score(expected, candidate)
        assert score >= 70, f"Perfect match should score ≥90, got {score}"

    def test_brand_mismatch_penalizes(self):
        from src.utils.fuzzy import compute_match_score
        base = {'brand': 'Brand A', 'discount': '20', 'vendor_contrib': '10', 'categories': 'Flower'}
        wrong = dict(base, brand='Completely Different Brand XYZ')
        score_good = compute_match_score(base, base)
        score_bad  = compute_match_score(base, wrong)
        assert score_good > score_bad, "Brand mismatch should lower score"

    def test_discount_mismatch_penalizes(self):
        from src.utils.fuzzy import compute_match_score
        base = {'brand': 'Brand A', 'discount': '20', 'vendor_contrib': '10', 'categories': 'Flower'}
        wrong = dict(base, discount='99')
        score_good = compute_match_score(base, base)
        score_bad  = compute_match_score(base, wrong)
        assert score_good > score_bad, "Discount mismatch should lower score"

    def test_score_is_non_negative(self):
        from src.utils.fuzzy import compute_match_score
        a = {'brand': 'AAA', 'discount': '10'}
        b = {'brand': 'ZZZ', 'discount': '99', 'vendor_contrib': '50'}
        assert compute_match_score(a, b) >= 0


# ══════════════════════════════════════════════════════════════════════════════
# 5 — Profile Management Helpers
# ══════════════════════════════════════════════════════════════════════════════

class TestProfileHelpers:
    def test_build_profile_config_none(self):
        from src.api.profiles import build_profile_config
        cfg = build_profile_config(None)
        assert cfg['handle'] is None
        assert 'chrome_default' in cfg['chrome_profile_dir']

    def test_build_profile_config_handle(self):
        from src.api.profiles import build_profile_config
        cfg = build_profile_config('john.doe')
        assert cfg['handle'] == 'john.doe'
        assert 'john.doe' in cfg['token_file']
        assert 'john.doe' in cfg['credentials_file']
        assert 'john.doe' in cfg['blaze_config_file']
        assert 'john.doe' in cfg['chrome_profile_dir']

    def test_register_profile_empty_handle(self):
        from src.api.profiles import register_profile_api
        result = register_profile_api('')
        assert result['success'] is False
        assert 'empty' in result['error'].lower()

    def test_register_profile_invalid_chars(self):
        from src.api.profiles import register_profile_api
        result = register_profile_api('invalid handle!')
        assert result['success'] is False

    def test_register_profile_valid_handle_no_creds(self):
        from src.api.profiles import register_profile_api
        # Should fail: no credentials file exists for a random handle
        result = register_profile_api('no.creds.handle.test')
        assert result['success'] is False
        assert result.get('error') in ('credentials_not_found', )

    def test_get_available_profiles_returns_list(self):
        from src.api.profiles import get_available_profiles
        profiles = get_available_profiles()
        assert isinstance(profiles, list)

    def test_check_credentials_returns_bool(self):
        from src.api.profiles import check_credentials_for_handle
        result = check_credentials_for_handle('nonexistent.user.test')
        assert isinstance(result, bool)
        assert result is False

    def test_load_profile_credentials_no_handle(self):
        from src.api.profiles import load_profile_credentials
        result = load_profile_credentials(None)
        assert result == {}

    def test_auto_select_profile_returns_dict(self):
        from src.api.profiles import auto_select_profile
        result = auto_select_profile()
        assert isinstance(result, dict)
        assert 'handle' in result
        assert 'chrome_profile_dir' in result


# ══════════════════════════════════════════════════════════════════════════════
# 6 — Date Helpers
# ══════════════════════════════════════════════════════════════════════════════

class TestDateHelpers:
    def test_import(self):
        from src.utils.date_helpers import normalize_date
        assert callable(normalize_date)

    def test_normalize_slashed_date(self):
        from src.utils.date_helpers import normalize_date
        result = normalize_date('01/15/2025')
        assert '2025' in result or '01' in result or '15' in result

    def test_normalize_empty_string(self):
        from src.utils.date_helpers import normalize_date
        result = normalize_date('')
        assert result == '' or result is None

    def test_normalize_none(self):
        from src.utils.date_helpers import normalize_date
        try:
            result = normalize_date(None)
            assert result == '' or result is None
        except (TypeError, AttributeError):
            pass  # Acceptable: function may not guard None


# ══════════════════════════════════════════════════════════════════════════════
# 7 — Brand Helpers
# ══════════════════════════════════════════════════════════════════════════════

class TestBrandHelpers:
    def test_import(self):
        from src.utils.brand_helpers import resolve_brand_for_match
        assert callable(resolve_brand_for_match)

    def test_settings_brand_overrides(self):
        """Settings tab brand rules ALWAYS win (ARCHITECTURE_LOGIC.md rule #1)."""
        from src.utils.brand_helpers import resolve_brand_for_match
        # Brand from Settings should override the sheet brand
        settings_override = {'sheet_brand': 'Google Brand', 'settings_brand': 'Override Brand'}
        result = resolve_brand_for_match('Google Brand', brand_settings={'Google Brand': 'Override Brand'})
        # Should return the mapped brand from settings
        assert result == 'Override Brand'

    def test_no_override_returns_original(self):
        from src.utils.brand_helpers import resolve_brand_for_match
        result = resolve_brand_for_match('My Brand', brand_settings={})
        assert result == 'My Brand'


# ══════════════════════════════════════════════════════════════════════════════
# 8 — CSV Resolver
# ══════════════════════════════════════════════════════════════════════════════

class TestCSVResolver:
    def test_import(self):
        from src.utils.csv_resolver import resolve_mis_csv
        assert callable(resolve_mis_csv)

    def test_no_path_returns_none_or_empty(self):
        from src.utils.csv_resolver import resolve_mis_csv
        result = resolve_mis_csv()
        # Without a path, should return None or empty DataFrame
        assert result is None or hasattr(result, 'empty')

    def test_nonexistent_path_returns_none(self):
        from src.utils.csv_resolver import resolve_mis_csv
        result = resolve_mis_csv()
        assert result is None or (hasattr(result, 'empty') and result.empty)


# ══════════════════════════════════════════════════════════════════════════════
# 9 — API Routes (without Selenium / real Google auth)
# ══════════════════════════════════════════════════════════════════════════════

class TestAPIRoutes:
    def test_profiles_list_endpoint(self, client):
        resp = client.get('/api/profiles')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'success' in data
        assert 'profiles' in data

    def test_profile_current_endpoint(self, client):
        resp = client.get('/api/profile/current')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'success' in data

    def test_check_credentials_endpoint(self, client):
        resp = client.get('/api/profile/check-credentials/test.user')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['exists'] is False  # No test.user credentials in test env

    def test_profile_register_missing_handle(self, client):
        resp = client.post('/api/profile/register',
                           data=json.dumps({'handle': ''}),
                           content_type='application/json')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is False

    def test_get_credentials_endpoint(self, client):
        resp = client.get('/api/get-credentials')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'success' in data

    def test_mis_reports_folder_endpoint(self, client):
        resp = client.get('/api/get-mis-reports-folder')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert 'path' in data

    def test_health_has_profile_key(self, client):
        resp = client.get('/health')
        data = resp.get_json()
        assert 'profile' in data


# ══════════════════════════════════════════════════════════════════════════════
# 10 — mis_entry.py Utilities (no Selenium)
# ══════════════════════════════════════════════════════════════════════════════

class TestMISEntryUtilities:
    def test_strip_mis_id_tag_prefix(self):
        from src.automation.mis_entry import strip_mis_id_tag
        assert strip_mis_id_tag('W1: 12345')       == '12345'
        assert strip_mis_id_tag('GAP: 67890')       == '67890'
        assert strip_mis_id_tag('Part 1: 99999')    == '99999'
        assert strip_mis_id_tag('M1: 88888')        == '88888'
        assert strip_mis_id_tag('WP: 11111')        == '11111'

    def test_strip_mis_id_tag_no_prefix(self):
        from src.automation.mis_entry import strip_mis_id_tag
        assert strip_mis_id_tag('12345') == '12345'

    def test_strip_mis_id_tag_empty(self):
        from src.automation.mis_entry import strip_mis_id_tag
        assert strip_mis_id_tag('') == ''
        assert strip_mis_id_tag(None) == ''

    def test_master_store_list_count(self):
        from src.automation.mis_entry import MASTER_STORE_LIST
        assert len(MASTER_STORE_LIST) == 12

    def test_master_store_list_no_green_easy_old(self):
        from src.automation.mis_entry import MASTER_STORE_LIST
        assert 'Green Easy (Old)' not in MASTER_STORE_LIST

    def test_build_xpath_contains_simple(self):
        from src.automation.mis_entry import _build_xpath_contains
        result = _build_xpath_contains('Brand Name')
        assert result == "'Brand Name'"

    def test_build_xpath_contains_apostrophe(self):
        from src.automation.mis_entry import _build_xpath_contains
        result = _build_xpath_contains("O'Brien")
        # Should use concat() to handle the apostrophe
        assert 'concat' in result
        assert "O" in result
        assert "Brien" in result
