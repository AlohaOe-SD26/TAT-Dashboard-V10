# TAT-MIS-Architect — API Reference

> Auto-generated from blueprint route definitions. Last updated: Step 10.

---

## Profiles
*Source: `src/api/profiles.py`*

### `GET /api/profiles`

### `GET /api/profile/current`

### `POST /api/profile/switch`

### `POST /api/profile/register`

### `GET /api/profile/check-credentials/<handle>`

### `POST /api/profile/delete`

### `POST /api/auth/google`

### `GET /api/get-credentials`

### `POST /api/save-profile-credentials`

### `GET /api/get-mis-reports-folder`

### `GET /api/open-mis-reports-folder`

## MIS Matcher
*Source: `src/api/mis_matcher.py`*

### `POST /api/mis/load-sheet`

### `POST /api/mis/generate-csv`

### `GET /api/mis/download-csv`

### `POST /api/mis/pull-csv`
Proxy to background pull — browser automation handled in mis_automation blueprint.

### `POST /api/mis/match`
ID Matcher: Match Google Sheet rows to MIS ID candidates.

### `POST /api/mis/apply-matches`
Write confirmed MIS IDs back to the Google Sheet (section-aware tags).

### `POST /api/mis/apply-blaze-titles`
Write standardized Blaze discount titles to Google Sheet.

### `POST /api/mis/apply-split-id`
Write tagged MIS ID (W1/W2/WP etc.) to a Google Sheet row.

### `POST /api/mis/search-brand`
Delegate to mis_automation blueprint for Selenium search.

## Up-Down Planner
*Source: `src/api/mis_updown.py`*

### `POST /api/mis/split-audit/planning`
Phase 1: Read Google Sheet, calculate the 4-step slicing plan.

### `POST /api/mis/split-audit/gap-check`
Phase 2: Verify that manually entered MIS splits have closed all timeline gaps.

### `POST /api/mis/split-audit/final`
Phase 3: Final Audit — ensures exactly 1 dominant deal on each conflict date.

### `POST /api/mis/split-audit/final-check`
Phase 4: Human-in-the-Loop. Verifies saved MIS data matches the plan.

### `POST /api/mis/split-audit/fuzzy-suggestions`
Lightweight helper: find existing MIS IDs when strict name match fails.

## MIS Audit
*Source: `src/api/mis_audit.py`*

### `POST /api/mis/maudit`
MAudit: Verify Google Sheet deals against MIS CSV.

### `POST /api/mis/gsheet-conflict-audit`
Date-aware pre-flight check: Scans Google Sheet for cross-section brand conflicts.

### `POST /api/mis/conflict-audit`
Scans MIS CSV for internal conflicts (active deals with matching Brand+Weekday).

### `POST /api/mis/cleanup-audit`
Cleanup Audit: find active MIS entries that should be turned off.

### `POST /api/audit/save-state`
Persist comprehensive audit state to SessionManager.

### `GET /api/audit/load-state`
Restore previously saved audit state.

### `POST /api/audit/export`
Export audit results to a file (JSON for now; Excel in Step 7).

### `POST /api/mis/review-discrepancy`
Acknowledge a mismatch and add a note to session state.

### `POST /api/mis/lookup-mis-id`
Look up MIS ID in CSV and return full entry data.

### `POST /api/mis/validate-lookup`
V2-LOOKUP: Browser datatable click handler.

### `POST /api/mis/compare-to-sheet`
ValidationEngine Mode B: Compare a live MIS entry against its Google Sheet row.

## MIS Automation
*Source: `src/api/mis_automation.py`*

### `POST /api/restart`
Hard restart via os.execv.

### `GET /api/browser-status`
Return current browser readiness.

### `GET /api/get-settings-dropdowns`
Fetch dropdown options from Settings tab for Enhanced Create Popup.

### `POST /api/init-all`
Initialize browser, MIS login, and Blaze login in sequence.

### `POST /api/mis/create-deal`
Automation: Fill MIS modal via Selenium. Builds ValidationRecord for pre-flight.

### `POST /api/mis/automate-create-deal`
Full automation path for Up-Down Planning and ID Matcher create buttons.

### `POST /api/mis/update-end-date`
Automation: Update an existing MIS entry's end date via Selenium.

### `POST /api/mis/automate-end-date`
Full end-date automation sequence.

### `POST /api/mis/inject-validation`
Inject MIS validation system into the current browser page.

### `POST /api/mis/open-sheet-row`
Open a specific Google Sheet row in the browser.

### `POST /api/mis/generate-newsletter`
Generate Newsletter files (Excel + optionally Blaze sync).

## Blaze
*Source: `src/api/blaze.py`*

### `GET /api/blaze/refresh`

### `GET /api/blaze/poll-update`

### `GET /api/blaze/get-cache`

### `GET /api/blaze/export-csv`

### `POST /api/blaze/export-filtered-csv`
Export only the filtered/visible rows as CSV.

### `POST /api/blaze/zombie-disable`
Disable a single zombie promotion via browser automation.

### `POST /api/blaze/navigate`

### `POST /api/blaze/create-discount`
Automates creation of a new discount in Blaze.

### `GET /api/tax-rates`
Fetch tax rates (defaults + local overrides from tax_config.json).

### `POST /api/save-tax-rates`
Save user-edited tax rates to tax_config.json.

### `GET /api/debug/analyze-collections`
DIAGNOSTIC: Navigate to Collections page and analyze network traffic.

### `POST /api/blaze/update-tags`
Trigger the Tier Promotion Tag Update sequence in background.

### `POST /api/blaze/inventory/start`
Start inventory report generation in background thread.

### `GET /api/blaze/inventory/status`

### `GET /api/blaze/inventory/data`
Return current inventory data for UI display.

### `GET /api/blaze/inventory/download`
Redirect to inventory folder (Windows Explorer or Finder).

### `POST /api/blaze/inventory/fetch`
Fetch inventory data and cache it per store.

### `POST /api/blaze/inventory/get-tab-data`
Retrieve cached inventory data for a specific store (lazy loading).

### `POST /api/blaze/inventory/export`
Generate CSV/Excel export based on modal selections.

### `GET /api/blaze/inventory/list-reports`
List all available inventory CSV files in the INVENTORY directory.

### `POST /api/blaze/inventory/load-report`
Load a saved inventory report from file.

### `POST /api/blaze/inventory/export-tabs`
Export selected tabs as CSV (single tab) or XLSX (multiple tabs).

### `POST /api/blaze/inventory/navigate-to-product`
Navigate Blaze browser to specific product page.
