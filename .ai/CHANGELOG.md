# TAT-MIS-Architect — Changelog
# Format: [Version] — YYYY-MM-DD
# All changes relative to the new modular architecture (not the legacy TAT-Dashboard monolith).

---

## [Unreleased]
_Changes staged for the next version go here._

---

## [1.2.0-utilities] — 2026-02-20
### Step 3 — Pure Utility Migration
Zero logic changes. Direct extraction from `main_-_bloat.py` into typed modules.

| File | Lines | Functions |
|---|---|---|
| `src/utils/date_helpers.py` | 486 | 12 — `get_monthly_day_of_month`, `parse_end_date`, `parse_tab_month_year`, `expand_weekday_to_dates`, `parse_monthly_dates`, `parse_sale_dates`, `get_all_weekdays_for_multiday_group`, `filter_mis_by_date`, `parse_monthly_ordinals`, `parse_sale_dates_for_validation`, `calculate_expected_dates`, `check_mis_weekday_active` |
| `src/utils/location_helpers.py` | 396 | 9 — `parse_locations`, `resolve_to_store_set`, `calculate_location_conflict`, `format_location_set`, `format_location_display`, `format_csv_locations`, `resolve_location_columns`, `find_locations_value`, `convert_store_name_to_data_cy` |
| `src/utils/brand_helpers.py` | 538 | 10 — `resolve_brand_for_match` (authoritative), `manage_brand_list`, `load_brand_settings`, `get_brand_for_mis_id`, `parse_multi_brand`, `is_multi_brand`, `get_brand_from_mis_id`, `match_mis_ids_to_brands`, `format_brand_mis_ids`, `update_tagged_mis_cell` |
| `src/utils/fuzzy.py` | 157 | 2 — `compute_match_score` (canonical scorer), `generate_fuzzy_suggestions` |
| `src/utils/csv_resolver.py` | 121 | 2 — `resolve_mis_csv` (single loader), `load_sync_keys` |

#### Architecture Notes
- `resolve_brand_for_match()` is the enforced Settings-tab-wins resolver — never bypass it
- `compute_match_score()` is the canonical scorer: Brand 50 / Discount 30 / Vendor 15 / Category 5
- `resolve_mis_csv()` eliminates 6x CSV loading duplication from monolith
- `src/utils/__init__.py` exposes all 36 public symbols — import from package not submodule

---

## [1.1.0-no-touch-zones] — 2026-02-20
### Step 2 — No-Touch Zone Migration
**Rule:** Zero logic changes. Direct verbatim extraction from `main_-_bloat.py`.
Only permitted modification: `@app.route` → `@bp.route` in the Blaze API Blueprint.

#### Files Populated
| File | Lines | Source Lines in Monolith | Functions |
|------|-------|--------------------------|-----------|
| `src/integrations/blaze_api.py` | 930 | ~3344–4282 | `analyze_blaze_network_traffic`, `get_api_data`, `scrape_blaze_data_from_browser`, `update_single_promotion_in_memory`, `monitor_browser_return`, `BlazeTokenManager` |
| `src/integrations/google_sheets.py` | 339 | ~4006–4934 | `authenticate_google_sheets`, `open_google_sheet_in_browser`, `get_available_tabs`, `fetch_google_sheet_data`, `fetch_tax_rates`, `scan_bracket_headers` |
| `src/automation/browser.py` | 593 | ~2991–4432 | `check_login_state`, `ensure_logged_in`, `execute_in_background`, `mis_login_silent`, `init_browser`, `mis_login`, `ensure_mis_ready` |
| `src/automation/blaze_sync.py` | 457 | ~2476–2990 | `get_ecom_token`, `trigger_ecom_sync`, `normalize_store_name`, `_extract_except_stores`, `normalize_location_string` |
| `src/api/blaze.py` | 1646 | ~33711–35332 | 24 `@bp.route` handlers for all `/api/blaze/*` endpoints |

#### Decorator Migration
- All `@app.route(...)` in `src/api/blaze.py` converted to `@bp.route(...)` — **only permitted change**
- `bp = Blueprint('blaze', __name__, url_prefix='')` declared at top of `src/api/blaze.py`

#### Known Deferred Work (Step 4)
- `GLOBAL_DATA` references in all extracted files remain as-is; will be replaced with `SessionManager` calls in Step 4
- Cross-module imports (e.g. blaze routes calling `scrape_blaze_data_from_browser`) not yet wired — will resolve in Step 4/6

#### Verification Gate
- [ ] Blaze tab loads and displays promotion data
- [ ] `/api/blaze/refresh` returns 200
- [ ] `/api/blaze/get-cache` returns cached data
- [ ] ecom-sync route accessible (even if credentials not configured)

---

## [1.0.0-shell] — 2026-02-19
### Added
- Full directory scaffold: `src/`, `static/`, `templates/`, `.ai/`, `config/`, `reports/`
- Flask app factory in `src/app.py` with Blueprint registration stubs for all 6 API modules
- `run.py` entry point at project root
- `SessionManager` class stub in `src/session/manager.py` (SQLite-backed, Redis-swappable interface)
- `ValidationEngine` with `ValidationRecord` and `FieldResult` dataclasses in `src/core/validation_engine.py`
- `resolve_mis_csv()` utility stub in `src/utils/csv_resolver.py`
- `resolve_brand_for_match()` utility stub in `src/utils/brand_helpers.py` with precedence rule encoded
- Hybrid logger implementation in `src/utils/logger.py` (file logging + print for console)
- `.ai/PROJECT_STATE.md` — AI handoff document and living state tracker
- `.ai/ARCHITECTURE_LOGIC.md` — Algorithm and pattern reference
- `.ai/CHANGELOG.md` — This file
- `.gitignore` covering Python, secrets, reports, venv, session DB
- `requirements.txt` with all known dependencies from legacy monolith
- `config/settings.json` with default configuration template
- Frontend placeholders: `templates/index.html`, `static/css/`, `static/js/`
- CSS variable token stubs in `static/css/variables.css`
- Centralized JS API wrapper stubs in `static/js/api.js`
- Client-side state object stub in `static/js/state.js`

### Architecture Decisions Recorded
- `GLOBAL_DATA` dict from monolith → `SessionManager` class (see `SESSION_MANAGER` rule)
- 6x-duplicated CSV loading pattern → single `resolve_mis_csv()` call
- Dual audit engines (legacy + MAudit) → MAudit only, legacy is dead code
- Embedded HTML/JS/CSS string → fully decoupled `templates/` + `static/`
- Brand precedence rule: Settings tab always wins over raw MIS CSV brand list
