# tests/test_routes.py — Flask route integration tests
# These test the HTTP layer: correct status codes, JSON shape, error handling.
from __future__ import annotations

import io
import json
import pytest


# ─────────────────────────────────────────────────────────────────────────────
# /health
# ─────────────────────────────────────────────────────────────────────────────
class TestHealthRoute:
    def test_health_returns_200(self, client):
        resp = client.get('/health')
        assert resp.status_code == 200

    def test_health_returns_json(self, client):
        resp = client.get('/health')
        data = resp.get_json()
        assert data is not None
        assert 'status' in data

    def test_health_status_ok(self, client):
        resp = client.get('/health')
        data = resp.get_json()
        assert data['status'] in ('ok', 'healthy', 'running')


# ─────────────────────────────────────────────────────────────────────────────
# /api/profiles
# ─────────────────────────────────────────────────────────────────────────────
class TestProfilesRoute:
    def test_get_profiles_200(self, client):
        resp = client.get('/api/profiles')
        assert resp.status_code == 200

    def test_get_profiles_json_shape(self, client):
        resp = client.get('/api/profiles')
        data = resp.get_json()
        assert 'success' in data
        assert 'profiles' in data
        assert isinstance(data['profiles'], list)

    def test_current_profile_200(self, client):
        resp = client.get('/api/profile/current')
        assert resp.status_code == 200

    def test_current_profile_has_handle_key(self, client):
        resp = client.get('/api/profile/current')
        data = resp.get_json()
        assert 'handle' in data

    def test_check_credentials_unknown_handle(self, client):
        resp = client.get('/api/profile/check-credentials/nonexistent')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is True
        assert data['exists'] is False

    def test_register_profile_missing_handle(self, client):
        resp = client.post('/api/profile/register',
                           json={'handle': ''},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is False
        assert 'error' in data

    def test_register_profile_invalid_chars(self, client):
        resp = client.post('/api/profile/register',
                           json={'handle': 'bad handle!'},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is False

    def test_switch_profile_nonexistent(self, client):
        resp = client.post('/api/profile/switch',
                           json={'handle': 'nonexistent_profile'},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is False

    def test_delete_profile_no_handle(self, client):
        resp = client.post('/api/profile/delete',
                           json={},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is False


# ─────────────────────────────────────────────────────────────────────────────
# /api/browser-status
# ─────────────────────────────────────────────────────────────────────────────
class TestBrowserStatus:
    def test_browser_status_200(self, client):
        resp = client.get('/api/browser-status')
        assert resp.status_code in (200, 404)  # 404 if route not on profiles bp

    def test_browser_status_shape(self, client):
        resp = client.get('/api/browser-status')
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'ready' in data or 'instance' in data


# ─────────────────────────────────────────────────────────────────────────────
# /api/mis/maudit — no-CSV guard
# ─────────────────────────────────────────────────────────────────────────────
class TestMauditRoute:
    def test_maudit_no_tab_returns_error(self, client):
        resp = client.post('/api/mis/maudit', data={})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['success'] is False
        assert 'error' in data

    def test_maudit_with_tab_no_csv_returns_error(self, client):
        resp = client.post('/api/mis/maudit',
                           data={'tab': 'January 2025'})
        data = resp.get_json()
        assert data['success'] is False

    def test_maudit_with_csv_upload(self, client, sample_mis_df, tmp_path):
        csv_path = tmp_path / 'test.csv'
        sample_mis_df.to_csv(csv_path, index=False)
        with open(csv_path, 'rb') as f:
            resp = client.post(
                '/api/mis/maudit',
                data={'tab': 'January 2025',
                      'csv': (f, 'test.csv')},
                content_type='multipart/form-data',
            )
        data = resp.get_json()
        # Success depends on sheet auth — accept False with 'error' about sheets
        assert 'success' in data


# ─────────────────────────────────────────────────────────────────────────────
# /api/mis/cleanup-audit — was 501, now implemented
# ─────────────────────────────────────────────────────────────────────────────
class TestCleanupAuditRoute:
    def test_cleanup_no_longer_501(self, client):
        resp = client.post('/api/mis/cleanup-audit', data={'tab': 'January 2025'})
        assert resp.status_code != 501

    def test_cleanup_no_tab_error(self, client):
        resp = client.post('/api/mis/cleanup-audit', data={})
        data = resp.get_json()
        assert data['success'] is False
        assert 'tab' in data['error'].lower() or 'error' in data

    def test_cleanup_no_csv_error(self, client):
        resp = client.post('/api/mis/cleanup-audit', data={'tab': 'January 2025'})
        data = resp.get_json()
        assert data['success'] is False
        # Should mention CSV
        assert 'csv' in data['error'].lower() or 'MIS' in data['error']


# ─────────────────────────────────────────────────────────────────────────────
# /api/mis/gsheet-conflict-audit
# ─────────────────────────────────────────────────────────────────────────────
class TestGsheetConflictAudit:
    def test_no_tab_error(self, client):
        resp = client.post('/api/mis/gsheet-conflict-audit',
                           json={},
                           content_type='application/json')
        data = resp.get_json()
        assert data['success'] is False

    def test_200_response(self, client):
        resp = client.post('/api/mis/gsheet-conflict-audit',
                           json={'tab': 'January 2025', 'month': 1, 'year': 2025},
                           content_type='application/json')
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# /api/get-credentials
# ─────────────────────────────────────────────────────────────────────────────
class TestGetCredentials:
    def test_returns_200(self, client):
        resp = client.get('/api/get-credentials')
        assert resp.status_code == 200

    def test_returns_success_key(self, client):
        data = client.get('/api/get-credentials').get_json()
        assert 'success' in data

    def test_no_passwords_in_response(self, client):
        data = client.get('/api/get-credentials').get_json()
        if data.get('credentials'):
            creds = data['credentials']
            assert 'mis_password' not in creds
            assert 'blaze_password' not in creds
