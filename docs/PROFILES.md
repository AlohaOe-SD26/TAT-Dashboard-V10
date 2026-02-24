# TAT-MIS-Architect — Profile Setup Guide

Profiles allow multiple users or store configurations to share a single instance, each with their own Google OAuth token, Chrome session, and Blaze/MIS credentials.

---

## What a Profile Contains

| File | Location | What it holds |
|---|---|---|
| OAuth client secret | `config/google_creds/credentials_{handle}.json` | Google Cloud credentials (from Google Cloud Console) |
| OAuth access token | `config/tokens/token_{handle}.json` | Auto-generated on first auth. Refreshed automatically. |
| MIS/Blaze credentials | `config/blaze_configs/blaze_config_{handle}.json` | MIS username/password, Blaze API URL |
| Chrome profile dir | `config/chrome/chrome_{handle}/` | Separate Chrome session (cookies, localStorage) |

---

## First-Time Setup

### Step 1 — Get Google OAuth credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Google Sheets API**
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
4. Application type: **Desktop App**
5. Download JSON → rename to `credentials_{yourhandle}.json`
6. Place in `config/google_creds/`

### Step 2 — Register the profile
```bash
curl -X POST http://localhost:5000/api/profile/register \
  -H "Content-Type: application/json" \
  -d '{"handle": "nick.tat"}'
```

Or via the UI: Settings tab → Profile section → Register.

**Handle rules:** lowercase letters, numbers, dots, hyphens only (`nick.tat`, `store-la`, `admin`).

### Step 3 — Authenticate with Google
```bash
curl -X POST http://localhost:5000/api/auth/google
```

A browser window opens for the OAuth flow. On completion, `config/tokens/token_{handle}.json` is created automatically.

### Step 4 — Save MIS/Blaze credentials
```bash
curl -X POST http://localhost:5000/api/save-profile-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "mis_username": "nick@theartisttree.com",
    "mis_password": "yourpassword",
    "blaze_api_url": "https://api.blaze.me"
  }'
```

---

## Switching Profiles

```bash
curl -X POST http://localhost:5000/api/profile/switch \
  -H "Content-Type: application/json" \
  -d '{"handle": "other.user"}'
```

Profile switch requires a server restart. The API returns `{"success": true, "requires_restart": true}`.

---

## Auto-Selection at Startup

Priority order:
1. `BLAZE_PROFILE` environment variable
2. `config/last_profile.json` (last used handle)
3. First valid profile found in `config/tokens/`
4. First-run mode (no profile — registration UI shown)

---

## Multi-User Deployment

For multiple simultaneous users, deploy separate instances (different ports / processes) with different `BLAZE_PROFILE` environment variables:

```bash
# User A
BLAZE_PROFILE=nick.tat PORT=5000 python run.py

# User B
BLAZE_PROFILE=lisa.tat PORT=5001 python run.py
```

Each instance maintains its own `SessionManager` state (browser, Google Sheets connection, MIS CSV).

> **Note:** A single-user application per process is by design. The SessionManager is not multi-user concurrent — it's per-process singleton state.

---

## Redis Session (Production)

For deployments where Flask reloads frequently or multiple workers are used:

```json
// config/settings.json
{
  "SESSION_BACKEND": "redis",
  "REDIS_URL": "redis://localhost:6379/0",
  "REDIS_PREFIX": "tat_mis_nick:",
  "REDIS_TTL": 86400
}
```

```bash
pip install redis
redis-server &
```

The Redis backend uses `SCAN`-safe key deletion and TTL-based expiry. Volatile session state (Selenium driver, DataFrames) always stays in-process memory regardless of backend.

---

## Deleting a Profile

```bash
curl -X POST http://localhost:5000/api/profile/delete \
  -H "Content-Type: application/json" \
  -d '{"handle": "old.user"}'
```

This removes `config/tokens/token_{handle}.json` only. The `credentials_{handle}.json` and `blaze_config_{handle}.json` are **not deleted** (preserving Google OAuth client secret for re-registration).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/profile/current` returns `{"handle": null}` | First-run mode | Register a profile |
| OAuth window doesn't open | Missing credentials file | Check `config/google_creds/credentials_{handle}.json` exists |
| `{"error": "credentials_not_found"}` on register | Credentials file missing | Download from Google Cloud Console |
| Profile switch has no effect | Restart not performed | Restart the Flask server after switching |
| `Token has been expired or revoked` | OAuth token stale | Re-run `POST /api/auth/google` |
