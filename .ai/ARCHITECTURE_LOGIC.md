# TAT-MIS-Architect — Architecture & Core Logic
# Source of Truth for algorithmic patterns. Update this when a core pattern changes.
# v1.0 — Initialized from legacy ARCHITECTURE_LOGIC.md + Phase 1/2 clarification session.

---

## 1. The "Grey Box" Integration Model

| System | Integration Method | Notes |
|---|---|---|
| **Google Sheets** | Official Google Sheets API (Read/Write) | OAuth2, credentials in `config/profiles/` |
| **MIS** | Selenium automation via `undetected_chromedriver` | No MIS API exists. CSV export is the only data extraction path. |
| **Blaze** | Token Sniffer → Direct HTTP API | Launch background browser, monitor `driver.get_log('performance')` to capture `Authorization: Bearer ...`, then use token for direct API requests. |

**MIS CSV is the only reliable MIS data source.** The automated CSV pull sequence:
1. Selenium clears the MIS search bar
2. Waits for loading spinner to disappear
3. Waits for DataTable to populate
4. Waits a settling period (~2s)
5. Clicks the "CSV" button to trigger download
6. Moves file to `reports/` directory and renames it

---

## 2. Multi-Day Deal Logic (MD5 Group Hashing)

To prevent duplicate MIS entries for deals that span multiple weekdays, rows are grouped by a composite hash key:

```python
key = f"{brand}|{discount}|{vendor_contrib}|{locations}|{categories}|{notes}|{deal_info}|{start}|{end}"
```

- **Anchor row**: The first instance (e.g., Monday). This is the row that generates the MIS entry.
- **Reference rows**: Subsequent days (e.g., Wed, Fri) are visual-only in the dashboard (rendered as yellow rows). They do NOT generate separate MIS entries.
- **Implementation home**: `src/core/matcher.py::detect_multi_day_groups()`

---

## 3. The "Up-Down" Planning Hierarchy

### Conflict Tiers
- **Tier 1 (Sale / Monthly)**: DOMINANT. Never splits. Never modifies.
- **Tier 2 (Weekly)**: SUBSERVIENT. Must split around any Tier 1 overlap.

### 4-Step Slicing Scenario
When a recurring Tier 2 deal (e.g., Fri-Sun every week) is interrupted by a Tier 1 deal on a specific date (e.g., a Sale on 2/14 Saturday only):

| Step | Action | Example |
|---|---|---|
| **1. Modify Original** | End the recurring deal on the Sunday before the interruption | Runs 2/1–2/8, Fri-Sun |
| **2. The Patch** | New entry for the interruption week, but lock active days to non-conflicting days only | 2/13–2/15, Fri & Sun only (no Saturday) |
| **3. The Interruption** | Create the Tier 1 deal entry | 2/14 Saturday Sale |
| **4. The Continuation** | New entry resuming the normal schedule after interruption | 2/20–2/28, Fri-Sun |

### Phase Flow (Up-Down Planning Tab)
1. **Phase 1 (Planning)** — `/api/mis/split-audit/planning`: Reads Google Sheet, calculates the mathematical slicing plan. Produces a to-do list of MIS entries needed.
2. **Phase 2 (Gap-Check)** — `/api/mis/split-audit/gap-check`: After user manually enters the split entries in MIS, verifies the timeline gaps are closed.
3. **Phase 3 (Final)** — `/api/mis/split-audit/final`: Automation fills MIS modal via Selenium.
4. **Phase 4 (Final-Check)** — `/api/mis/split-audit/final-check`: Human-in-the-loop trigger. User manually saves in MIS, then final-check verifies the saved data matches the plan.
5. **Fuzzy Suggestions** — `/api/mis/split-audit/fuzzy-suggestions`: Lightweight helper to find existing MIS IDs when strict name matching fails due to typos.

---

## 4. Fuzzy Match Scoring (Total: 100 points)

| Field | Points | Method |
|---|---|---|
| Brand | 50 | `fuzz.token_set_ratio` + 5pt bonus if brand is in linked-brand map |
| Discount | 30 | Exact float match with tolerance ±0.01 |
| Vendor % | 15 | Exact float match with tolerance ±0.01 |
| Category | 5 | Set overlap (intersection / union) |

**Brand Settings Precedence (RULE 1 — NEVER INVERT):**
The Settings tab translation matrix (`brand_settings` dict) is applied BEFORE any fuzzy scoring against the raw MIS brand list. If a mapping exists for the Google Sheet brand name, it is translated first. Fuzzy scoring only runs on the translated name.

---

## 5. ValidationEngine Contract

```
source_record: ValidationRecord  ← The intended truth (Google Sheet row)
target_record: ValidationRecord  ← The actual entry (Selenium payload OR MIS CSV OR browser scrape)
         ↓
ValidationEngine.compare(source, target) → list[FieldResult]
         ↓
ValidationEngine.summary(results) → { overall_status, critical_count, advisory_count, details }
```

### Severity Map
| Severity | Fields | UI Effect |
|---|---|---|
| **CRITICAL** | `discount`, `vendor_pct`, `brand`, `locations`, `start_date`, `end_date` | RED banner — blocks save |
| **ADVISORY** | `active_days`, `categories`, `rebate_type` | ORANGE banner — warns only |

### Caller Modes (engine is unaware of these)
- **Mode A — Pre-Flight**: target built from Selenium automation payload before user saves in MIS
- **Mode B — Compare-to-Sheet**: target built from MIS CSV row or live browser-scraped MIS modal data

---

## 6. Google Sheet Structure

### Section Layout per Tab
Each monthly tab (e.g., "January 2025") contains three named sections parsed by `fetch_google_sheet_data()`:
- `weekly` — recurring weekday deals
- `monthly` — day-of-month deals
- `sale` — date-range deals

### Bracket Header Convention
Google Sheet headers use a multi-line bracket notation that evolved over time:
- Legacy format: `"Weekday"` (simple)
- Current format: `"Weekday\n[Weekday]"` (multi-line with bracket alias)

The `scan_bracket_headers()` utility normalizes both formats. All column lookups must use `get_col(row, ['[Weekday]', 'Weekday', 'Day of Week'])` with fallback aliases. This is non-negotiable — coworkers edit the sheet headers without notice.

### MIS ID Column Tags
When multiple MIS IDs exist for one Google Sheet row (split deals), they are stored in the same cell with sequential tags:
- `W1`, `W2` — Weekly entries
- `M1`, `M2` — Monthly entries
- `S1`, `S2` — Sale entries

---

## 7. SessionManager Backend Contract

The `SessionManager` class in `src/session/manager.py` uses SQLite now, Redis later. The swap must require zero changes to any caller (route files, core logic, etc.).

The abstraction contract:
```python
session.get(key: str, default: Any = None) -> Any
session.set(key: str, value: Any) -> None
session.clear() -> None
```

Typed accessors are provided for frequently-used complex objects (DataFrames, dicts) to avoid repeated JSON deserialization overhead.

---

## 8. Cleanup Audit (System Hygiene — Partially Planned)

Separate from the Comprehensive Audit. Does NOT cross-reference the Google Sheet.  
**Purpose**: Scan MIS in isolation for Zombie Deals:
- Active MIS entries whose ID does not appear in any Google Sheet row
- Active MIS entries that could be unintended duplicates of another active entry
- Expired or improperly scheduled active entries

**Status**: Architecture defined, implementation deferred until core audit logic is solid.
