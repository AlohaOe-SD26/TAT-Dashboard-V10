# TAT-MIS-Architect — AI Project State
# ⚠️ THIS IS THE HANDOFF DOCUMENT. Upload this file at the start of every new chat session.
# Last Updated: Step 10 Complete — 2026-02-23
# Current Step: Step 10 DONE → Project is feature-complete for solo deployment

---

## 🗺️ Project Identity

| Field | Value |
|---|---|
| **Project Name** | TAT-MIS-Architect |
| **Application** | BLAZE MIS Audit Pro (Modular Rebuild) |
| **Legacy Repo** | TAT-Dashboard (DO NOT MODIFY — kept as fallback) |
| **New Repo** | TAT-MIS-Architect |
| **Flask Entry Point** | `run.py` → `src/app.py` factory |
| **Current Version** | v2.0.0 (Steps 1–10 complete) |
| **Source of Truth Doc** | This file + `BLAZE_MIS_SYSTEM_SOURCE_OF_TRUTH_v12_23_12.md` (legacy reference) |

---

## 🏗️ Architecture Rules (Non-Negotiable)

### Rule 1: Settings Tab Brand Rules Always Win
`resolve_brand_for_match()` in `src/utils/brand_helpers.py` consults `brand_settings` (from Google Sheet Settings tab) BEFORE falling back to MIS CSV brand list. Never invert.

### Rule 2: One ValidationEngine, Two Callers
`src/core/validation_engine.py` is mode-agnostic: accepts `source: ValidationRecord` and `target: ValidationRecord`.
- **Mode A (Pre-Flight):** source = Sheet row, target = Selenium payload
- **Mode B (Compare-to-Sheet):** source = Sheet row, target = MIS CSV row / scraped data
Engine never knows which mode. No mode flags in engine internals.

### Rule 3: MAudit is the Only Audit Engine
Legacy `audit_google_vs_mis()` is dead code. All audit logic flows through `src/core/auditor.py`.

### Rule 4: GLOBAL_DATA is Dead
Replaced by `src/session/manager.py::SessionManager`. All routes use `from src.session import session`. SQLite backend is default; swap to Redis by setting `SESSION_BACKEND=redis` + `REDIS_URL` in config.

### Rule 5: resolve_mis_csv() is the Only CSV Loader
Call `resolve_mis_csv()` from `src/utils/csv_resolver.py`. No route implements its own CSV loading.

### Rule 6: No-Touch Zones
These files were migrated verbatim. Logic must NOT be changed without a documented reason:
- `src/integrations/blaze_api.py` — BlazeTokenManager, get_api_data, scrape_blaze_data_from_browser
- `src/integrations/google_sheets.py` — authenticate_google_sheets, fetch_google_sheet_data, fetch_tax_rates
- `src/automation/browser.py` — init_browser, ensure_mis_ready, mis_login
- `src/automation/blaze_sync.py` — All Blaze Selenium ops
- `src/api/blaze.py` — All /api/blaze/* routes (1647 lines)

### Rule 7: Pathlib is Law
Never `os.path.join`. Always `Path.cwd() / 'folder'` or `Path(__file__).resolve().parent`.

### Rule 8: Strict Type Hints
All new functions: Python 3.10+ type hints. Use `X | None` not `Optional[X]`.

### Rule 9: Hybrid Logging
`logging` module → `.log` files. `print()` → runtime console feedback. Both via `src/utils/logger.py`.

### Rule 10: Frontend is Fully Decoupled
HTML in `templates/index.html`. CSS in `static/css/`. JS in `static/js/`. No HTML strings in Python.

---

## ✅ Completed Steps (All 10)

### Step 1: Shell Creation ✅
Full directory scaffold. All module stubs. App boots, all routes 404 by design.

### Step 2: No-Touch Zone Migration ✅
Verbatim copy of: `blaze_api.py`, `google_sheets.py`, `browser.py`, `blaze_sync.py`, `blaze.py`. Zero logic changes.

### Step 3: Utility Extraction ✅
36 public functions extracted into `src/utils/`: `date_helpers`, `location_helpers`, `brand_helpers`, `fuzzy`, `csv_resolver`, `sheet_helpers`, `logger`.

### Step 4: SessionManager v2.0 ✅
79 `GLOBAL_DATA` substitutions. Two-tier storage: volatile dict (Selenium/pandas objects) + SQLite (serializable state). Bracket map refactor.

### Step 5: ValidationEngine v2.0 ✅
504 lines. `ValidationRecord`, `FieldResult`, `ValidationSummary` dataclasses. `compare()` and `summary()` methods. 45 unit tests.

### Step 6: API Blueprints ✅
4 blueprints complete: `mis_matcher`, `mis_updown`, `mis_audit`, `mis_automation`. 1,392 route lines + 95 foundation lines.

### Step 7: Frontend Extraction ✅
16,827-line JS monolith → 9 files: `state.js`, `api.js`, `datatables-init.js`, `preflight.js`, `validation-banner.js`, `tabs/mis-matcher.js`, `tabs/mis-updown.js`, `tabs/mis-audit.js`, `tabs/blaze.js`.

### Step 8: Integration Hardening ✅
- `profiles.py` (320 lines) — Full profile management, 11 routes, auto-select at startup
- `mis_entry.py` (591 lines) — Complete Selenium MIS automation (fill, create, end-date)
- `variables.css` (133 lines) — Full design token system (60+ tokens)
- `api.js` v2.0 (145 lines) — 50-endpoint typed namespace wrappers
- Fuzz fallback chain: rapidfuzz → fuzzywuzzy → difflib stub

### Step 9: Fetch Migration + Integration Tests ✅
- 56 inline `fetch()` calls → `api.*` namespace (100% migrated, zero remaining)
- `tests/test_integration.py` (380 lines, 52 tests, 10 test classes)
- `app.py` orphaned `_load_config()` body fixed
- Duplicate `/api/tax-rates` routes removed from `mis_automation.py`
- Google auth imports made lazy (graceful degradation for test environments)
- `extract_spreadsheet_id()`, `parse_tab_month_year()`, `normalize_date()` added as stubs

### Step 10: SessionManager v3.0 + Docs ✅
- `src/session/storage_backends.py` (232 lines) — Pluggable backend protocol
  - `StorageBackend` ABC: `get / set / delete / init / clear_all`
  - `SQLiteBackend`: default, zero deps, thread-safe
  - `RedisBackend`: production-scale, namespace prefixing, TTL, SCAN-safe clear
  - `build_backend(app.config)`: selects backend from `SESSION_BACKEND` / `REDIS_URL` config
- `src/session/manager.py` v3.0 — `__init__` accepts `StorageBackend`; `_db_*` delegates to backend
- `src/session/__init__.py` v2.0 — Calls `build_backend()` in `init_session()`
- `docs/API.md` — Complete 50-endpoint catalog with payloads and response shapes
- `docs/PROFILES.md` — Multi-user setup guide
- `PROJECT_STATE.md` — Updated to reflect all 10 steps complete

---

## 📐 Current File Inventory

### Python (src/)
| File | Lines | Status |
|---|---|---|
| `src/app.py` | 119 | ✅ Fixed (orphaned _load_config repaired) |
| `src/session/__init__.py` | 30 | ✅ v2.0 (build_backend wired) |
| `src/session/manager.py` | ~395 | ✅ v3.0 (StorageBackend delegation) |
| `src/session/storage_backends.py` | 232 | ✅ NEW — SQLite + Redis backends |
| `src/api/profiles.py` | 320 | ✅ Full implementation |
| `src/api/mis_matcher.py` | ~290 | ✅ Full routes |
| `src/api/mis_updown.py` | ~285 | ✅ Full routes |
| `src/api/mis_audit.py` | ~370 | ✅ Full routes |
| `src/api/mis_automation.py` | ~290 | ✅ Full routes |
| `src/api/blaze.py` | 1647 | ✅ NO-TOUCH ZONE |
| `src/core/validation_engine.py` | 504 | ✅ v2.0 |
| `src/core/matcher.py` | 637 | ✅ Migrated |
| `src/core/auditor.py` | 468 | ✅ Migrated |
| `src/core/updown_planner.py` | 573 | ✅ Migrated |
| `src/automation/mis_entry.py` | 591 | ✅ Full Selenium implementation |
| `src/automation/browser.py` | ~320 | ✅ NO-TOUCH ZONE |
| `src/automation/blaze_sync.py` | ~520 | ✅ NO-TOUCH ZONE |
| `src/integrations/google_sheets.py` | 521 | ✅ NO-TOUCH + Step 9 stubs |
| `src/integrations/blaze_api.py` | ~480 | ✅ NO-TOUCH ZONE |
| `src/utils/fuzzy.py` | 176 | ✅ 3-tier fuzz fallback |
| `src/utils/csv_resolver.py` | ~130 | ✅ Single loader |
| `src/utils/date_helpers.py` | ~360 | ✅ + normalize_date |
| `src/utils/brand_helpers.py` | ~180 | ✅ Settings override first |
| `src/utils/location_helpers.py` | ~220 | ✅ |
| `src/utils/sheet_helpers.py` | ~190 | ✅ bracket notation support |
| `src/utils/logger.py` | ~80 | ✅ Hybrid logger |

### Frontend
| File | Lines | Status |
|---|---|---|
| `templates/index.html` | 1679 | ✅ |
| `static/css/main.css` | ~1100 | ✅ |
| `static/css/variables.css` | 133 | ✅ Design tokens |
| `static/js/api.js` | 145 | ✅ 50-endpoint namespace |
| `static/js/state.js` | ~740 | ✅ 0 inline fetch() |
| `static/js/tabs/mis-audit.js` | ~3900 | ✅ 0 inline fetch() |
| `static/js/tabs/mis-matcher.js` | ~3600 | ✅ 0 inline fetch() |
| `static/js/tabs/mis-updown.js` | ~2100 | ✅ 0 inline fetch() |
| `static/js/tabs/blaze.js` | ~1900 | ✅ 0 inline fetch() |
| `static/js/components/datatables-init.js` | ~2800 | ✅ 0 inline fetch() |
| `static/js/components/preflight.js` | ~850 | ✅ 0 inline fetch() |

---

## 🧠 Critical Logic Reference

### Fuzzy Match Scoring
| Field | Points | Method |
|---|---|---|
| Brand | 50 | `fuzz.token_set_ratio()` + 5pt linked-brand bonus |
| Discount | 30 | Exact float match (tolerance 0.01) |
| Vendor % | 15 | Exact float match |
| Category | 5 | Set overlap |

### Multi-Day Group Hash Key
```
key = f"{brand}|{discount}|{vendor_contrib}|{locations}|{categories}|{notes}|{deal_info}|{start}|{end}"
```
First row = Anchor (creates MIS entry). Subsequent rows = Reference (yellow, display-only).

### ValidationEngine Severity
- **CRITICAL** (RED banner, blocks save): `discount`, `vendor_pct`, `brand`, `locations`, `start_date`, `end_date`
- **ADVISORY** (ORANGE banner, warns only): `active_days`, `categories`, `rebate_type`

### MIS CSV Resolution Priority
1. Uploaded file in request (`request.files.get('csv')`)
2. Pulled CSV on disk (path stored in SessionManager)
3. Raise `ValueError` with user-facing message

### SessionManager Backend Swap (Redis)
```json
// config/settings.json
{
  "SESSION_BACKEND": "redis",
  "REDIS_URL": "redis://localhost:6379/0",
  "REDIS_PREFIX": "tat_mis:",
  "REDIS_TTL": null
}
```
Or via environment: `SESSION_BACKEND=redis REDIS_URL=redis://...`

---

## ⚠️ Known Issues / Watch Points

- Browser init fails if ghost `chrome.exe` processes exist → handled in `automation/browser.py`
- Token Sniffer can miss refresh window if background tab is idle → handled in `integrations/blaze_api.py`
- Fuzzy Matcher slows with >500 rows → known, optimization deferred
- Google Sheet bracket notation headers (e.g. `Weekday\n[Weekday]`) → `scan_bracket_headers()` handles normalization
- `rapidfuzz`/`fuzzywuzzy` must be installed for accurate fuzzy scoring; difflib stub gives ~80% accuracy
- `google-auth` must be installed for Google Sheets auth; app loads without it but auth routes fail gracefully

---

## 📋 Handoff Instructions for Next AI Session

1. Read this entire file first.
2. Read `.ai/ARCHITECTURE_LOGIC.md` for algorithm details.
3. Read `CHANGELOG.md` [`## [Unreleased]`] for latest changes.
4. No active step — project is feature-complete. Next work likely: real-credential end-to-end test, or production deployment.
5. NEVER modify No-Touch Zone logic without explicit user approval.
6. NEVER re-introduce `GLOBAL_DATA` — use `SessionManager`.
7. NEVER create a second CSV loading pattern — use `resolve_mis_csv()`.
8. To enable Redis: set `SESSION_BACKEND=redis` + `REDIS_URL` in settings.json or environment.
