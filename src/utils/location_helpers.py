# =============================================================================
# src/utils/location_helpers.py
# Step 3: Pure utility extraction from main_-_bloat.py — zero logic changes.
# Contains: parse_locations, resolve_to_store_set, calculate_location_conflict, format_location_set, format_location_display, format_csv_locations, resolve_location_columns, find_locations_value, convert_store_name_to_data_cy
# =============================================================================
import re
from typing import Dict, List, Optional, Tuple, Any, Set, FrozenSet
import pandas as pd

# ── Store Constants (Single Source of Truth) ─────────────────────────────────

STORE_MAPPING: Dict[str, str] = {
    "The Artist Tree - West Hollywood": "West Hollywood",
    "The Artist Tree - Beverly Hills": "Beverly Hills",
    "The Artist Tree - Beverly": "Beverly Hills",
    "The Artist Tree - Koreatown": "Koreatown",
    "The Artist Tree - Riverside": "Riverside",
    "The Artist Tree - Fresno": "Fresno (Palm)",
    "The Artist Tree - Fresno Palm": "Fresno (Palm)",
    "The Artist Tree - Fresno Shaw": "Fresno (Shaw)",
    "The Artist Tree - Oxnard": "Oxnard",
    "The Artist Tree - El Sobrante": "El Sobrante",
    "The Artist Tree - Laguna Woods": "Laguna Woods",
    "The Artist Tree - Hawthorne": "Hawthorne",
    "The Artist Tree - Dixon": "Dixon",
    "The Artist Tree - Davis": "Davis",
    "West Hollywood": "West Hollywood",
    "Beverly": "Beverly Hills",
    "Beverly Hills": "Beverly Hills",
    "Koreatown": "Koreatown",
    "Riverside": "Riverside",
    "Fresno": "Fresno (Palm)",
    "Fresno Palm": "Fresno (Palm)",
    "Fresno (Palm)": "Fresno (Palm)",
    "Fresno Shaw": "Fresno (Shaw)",
    "Fresno (Shaw)": "Fresno (Shaw)",
    "Oxnard": "Oxnard",
    "El Sobrante": "El Sobrante",
    "Laguna Woods": "Laguna Woods",
    "Hawthorne": "Hawthorne",
    "Dixon": "Dixon",
    "Davis": "Davis",
}

_STORE_MAPPING_LOWER: Dict[str, str] = {k.lower(): v for k, v in STORE_MAPPING.items()}

ALL_STORES_SET: frozenset = frozenset([
    "Davis", "Dixon", "Beverly Hills", "El Sobrante",
    "Fresno (Palm)", "Fresno (Shaw)", "Hawthorne",
    "Koreatown", "Laguna Woods", "Oxnard",
    "Riverside", "West Hollywood",
])

ALL_STORES: List[str] = sorted(ALL_STORES_SET)
CSV_TARGET_STORES = ALL_STORES  # backward-compat alias


def normalize_store_name(raw_name: str) -> str:
    """Normalize any MIS/raw store name to canonical Google Sheet name."""
    if not raw_name:
        return raw_name
    clean = str(raw_name).strip()
    if not clean:
        return clean
    if clean in STORE_MAPPING:
        return STORE_MAPPING[clean]
    clean_lower = clean.lower()
    if clean_lower in _STORE_MAPPING_LOWER:
        return _STORE_MAPPING_LOWER[clean_lower]
    stripped = re.sub(
        r"^(The Artist Tree|Davisville Business Enterprises,?\s*Inc\.?|Club 420)\s*[-\u2013\u2014]?\s*",
        "", clean, flags=re.IGNORECASE
    ).strip()
    if stripped in STORE_MAPPING:
        return STORE_MAPPING[stripped]
    stripped_lower = stripped.lower()
    if stripped_lower in _STORE_MAPPING_LOWER:
        return _STORE_MAPPING_LOWER[stripped_lower]
    return stripped


def _extract_except_stores(text: str) -> list | None:
    """Extract exception store names from text containing 'Except:' ANYWHERE."""
    m = re.search(r'all\s+locations[\s(]*except[):\s]*(.+)', text, re.IGNORECASE)
    if not m:
        return None
    raw_part = m.group(1).strip().strip('()[] \t')
    if not raw_part:
        return []
    result = []
    for segment in raw_part.split(','):
        seg = segment.strip().strip('()[] \t')
        if not seg:
            continue
        normed = normalize_store_name(seg)
        if normed in ALL_STORES_SET:
            result.append(normed)
            continue
        for sep in [' - ', ' | ', ' (', ';']:
            if sep in seg:
                prefix = seg.split(sep)[0].strip()
                normed_prefix = normalize_store_name(prefix)
                if normed_prefix in ALL_STORES_SET:
                    result.append(normed_prefix)
                    break
    return sorted(set(result))


def normalize_location_string(loc_str: str) -> str:
    """Normalize a full MIS location string to canonical Google Sheet format."""
    if not loc_str or str(loc_str).strip().lower() in ['', 'nan', 'none', '-', 'n/a', 'nat']:
        return "All Locations"
    s = str(loc_str).strip()
    except_stores = _extract_except_stores(s)
    if except_stores is not None:
        if except_stores:
            return f"All Locations Except: {', '.join(except_stores)}"
        return "All Locations"
    if s.lower() in ['all locations', 'all']:
        return "All Locations"
    stores = sorted({normalize_store_name(st.strip()) for st in s.split(',') if st.strip()})
    if len(stores) >= len(ALL_STORES_SET) and set(stores) == ALL_STORES_SET:
        return "All Locations"
    return ', '.join(stores)


def parse_locations(location_str):
    """
    Parse location string into a set of store names.
    Handles: "All Locations", "All Locations Except: X, Y", "Store1, Store2, Store3"
    v12.26.1: Normalizes all store names via normalize_store_name() before comparison.
    v12.26.2: Detects "All Locations Except:" ANYWHERE in string, not just at start.
    Returns: (store_set, is_all_except, excluded_stores)
    """
    if not location_str or location_str == '-':
        return set(), False, set()
    
    location_str = str(location_str).strip()
    
    # v12.26.2: Handle "All Locations Except: X, Y, Z" ANYWHERE in string
    except_stores = _extract_except_stores(location_str)
    if except_stores is not None:
        excluded_stores = set(except_stores)
        included_stores = ALL_STORES_SET - excluded_stores
        return included_stores, True, excluded_stores
    
    # Handle "All Locations"
    if location_str.lower() in ['all locations', 'all']:
        return set(ALL_STORES_SET), False, set()
    
    # Handle comma-separated list - normalize each store name
    stores = {normalize_store_name(s.strip()) for s in location_str.split(',') if s.strip()}
    return stores, False, set()



def resolve_to_store_set(location_string: str) -> frozenset:
    """v12.26.3: Convert any location string to a normalized frozenset of canonical store names.
    Handles: 'All Locations', 'All Locations Except: X, Y', 'All Locations (Except: X)',
             specific comma-separated lists, blank/empty.
    Used for set-based comparison: if resolve_to_store_set(sheet) == resolve_to_store_set(mis): MATCH.
    """
    if not location_string or str(location_string).strip().lower() in ['', 'nan', 'none', '-', 'n/a', 'not specified']:
        return frozenset(ALL_STORES_SET)
    store_set, _, _ = parse_locations(location_string)
    if not store_set:
        return frozenset(ALL_STORES_SET)
    return frozenset(store_set)



def calculate_location_conflict(weekly_locations, tier1_locations):
    """
    Calculate if locations overlap and return conflict type and details.
    Returns: (has_conflict, conflict_stores, non_conflict_stores, conflict_type)
    conflict_type: 'FULL' or 'PARTIAL' or 'NONE'
    """
    weekly_set, weekly_is_except, weekly_excluded = parse_locations(weekly_locations)
    tier1_set, tier1_is_except, tier1_excluded = parse_locations(tier1_locations)
    
    # Calculate intersection
    conflicting_stores = weekly_set & tier1_set
    
    if not conflicting_stores:
        # No overlap
        return False, set(), set(), 'NONE'
    
    # Non-conflicting stores (where weekly continues during conflict)
    non_conflicting_stores = weekly_set - tier1_set
    
    if non_conflicting_stores:
        # Partial conflict - need PATCH
        return True, conflicting_stores, non_conflicting_stores, 'PARTIAL'
    else:
        # Full conflict - all weekly locations affected
        return True, conflicting_stores, set(), 'FULL'


def format_location_set(stores, original_weekly_locations=""):
    """
    Format a set of stores back into a display string.
    If it matches "All Locations", return that. Otherwise list stores.
    """
    if not stores:
        return "-"
    
    stores_set = set(stores)
    all_locations_set = set(ALL_LOCATIONS)
    
    # If it's all locations, just say "All Locations"
    if stores_set == all_locations_set:
        return "All Locations"
    
    # If it's "All Locations Except" format
    excluded = all_locations_set - stores_set
    if excluded and len(excluded) < len(stores_set):
        # More efficient to show as "except"
        return f"All Locations Except: {', '.join(sorted(excluded))}"
    
    # Just list the stores
    return ", ".join(sorted(stores))



def format_location_display(locations: str, exceptions: str) -> str:
    """v12.26.3: Format location + exceptions into display string.
    Outputs 'All Locations Except: X, Y' (no parentheses) for downstream set-matching.
    Normalizes store names to canonical Google Sheet format.
    """
    if pd.isna(locations) or not str(locations).strip():
        return "Not Specified"
    loc_str = str(locations).strip()
    exc_str = str(exceptions).strip() if pd.notna(exceptions) else ""
    if exc_str:
        # Normalize exception store names to canonical format
        exc_parts = [normalize_store_name(e.strip()) for e in exc_str.split(',') if e.strip()]
        exc_normalized = ', '.join(sorted(set(exc_parts)))
        return f"All Locations Except: {exc_normalized}"
    return loc_str


def format_csv_locations(locations_raw: str, exceptions_raw: str) -> str:
    """
    Parses Google Sheet location columns and returns the CSV-formatted string.
    Logic:
    1. If 'All Locations' and no exceptions -> Return "" (Blank)
    2. If 'All Locations' AND exceptions -> Return All CSV Stores minus exceptions.
    3. If specific stores -> Return mapped stores comma-separated.
    """
    loc_str = str(locations_raw).strip()
    exc_str = str(exceptions_raw).strip()
    
    # Normalize input
    is_all_locs = "all locations" in loc_str.lower()
    
    final_stores = set()
    
    if is_all_locs:
        if not exc_str or exc_str.lower() in ['nan', 'none', '']:
            return "" # Return blank if All Locations with no exceptions
        
        # All Locations EXCEPT...
        # 1. Start with all target stores
        final_stores = set(CSV_TARGET_STORES)
        
        # 2. Identify exceptions
        exceptions = [e.strip() for e in exc_str.split(',') if e.strip()]
        mapped_exceptions = []
        for e in exceptions:
            mapped = STORE_MAPPING.get(e, e) # Try to map, else use raw
            mapped_exceptions.append(mapped)
            
        # 3. Remove exceptions
        for exc in mapped_exceptions:
            if exc in final_stores:
                final_stores.remove(exc)
    else:
        # Specific locations listed
        raw_list = [l.strip() for l in loc_str.split(',') if l.strip()]
        for r in raw_list:
            if r in STORE_MAPPING:
                final_stores.add(STORE_MAPPING[r])
            else:
                # Fallback: check if it's already a valid target store
                if r in CSV_TARGET_STORES:
                    final_stores.add(r)
    
    # Return comma-separated string sorted alphabetically
    return ", ".join(sorted(list(final_stores)))


def resolve_location_columns(row: pd.Series) -> Tuple[str, str]:
    """
    Logic Router for Location Columns.
    v12.27.0: Checks [Store] bracket alias first.
    v12.25.7: Prioritizes column header containing "(Discount Applies At)" using FUZZY matching.
    Falls back to 'Locations' column if needed.
    
    HEADER DETECTION: Searches for header containing "(Discount Applies At)" (with parentheses)
    Handles multi-line headers where "Locations" and "(Discount Applies At)" are on separate lines.
    This makes the function resilient to column position changes in Google Sheet.
    """
    # v12.27.0: Check bracket alias first
    bracket_map = GLOBAL_DATA.get('mis', {}).get('bracket_map', {})
    bracket_store_col = bracket_map.get('[Store]')
    
    # 1. FUZZY FIND the "Master Switch" column
    # v12.25.7: Enhanced to handle multi-line headers and various formats
    master_col_name = None
    fallback_locations_col = None  # Pure "Locations" column (not Marketing)
    
    # v12.27.0: Bracket alias takes priority
    if bracket_store_col and bracket_store_col in row.index:
        master_col_name = bracket_store_col
        print(f"[LOCATION] v12.27.0: Using [Store] bracket → column '{bracket_store_col}'")
    
    # DEBUG: Print all column names once per unique set (helps diagnose column detection)
    debug_cols = [str(col) for col in row.index]
    if not hasattr(resolve_location_columns, '_logged_cols') or resolve_location_columns._logged_cols != debug_cols:
        resolve_location_columns._logged_cols = debug_cols
        print(f"[LOCATION-DEBUG] Available columns: {debug_cols}")
    
    # v12.27.0: Only do fuzzy scan if bracket alias didn't resolve
    if master_col_name is None:
        for col in row.index:
            col_str = str(col)
            c_lower = col_str.lower().replace('\n', ' ')  # Normalize newlines to spaces
            
            # Primary match: "(discount applies at)" with parentheses
            if '(discount applies at)' in c_lower:
                master_col_name = col
                print(f"[LOCATION] Found primary match: '{col_str}'")
                break
            # Secondary match: "discount applies" without parentheses
            if master_col_name is None and 'discount' in c_lower and 'applies' in c_lower:
                master_col_name = col
                print(f"[LOCATION] Found secondary match (discount+applies): '{col_str}'")
            # Fallback: "locations" column that is NOT the marketing column
            if fallback_locations_col is None:
                if 'locations' in c_lower and 'marketing' not in c_lower:
                    # Check if it starts with "locations" or is primarily a locations column
                    if c_lower.startswith('locations') or 'locations' in c_lower.split()[0] if c_lower.split() else False:
                        fallback_locations_col = col
                        print(f"[LOCATION] Found fallback 'Locations' column: '{col_str}'")
    
    # Use fallback if no primary match found
    if master_col_name is None and fallback_locations_col is not None:
        master_col_name = fallback_locations_col
        print(f"[LOCATION] Using fallback column: {master_col_name}")
    
    if master_col_name is None:
        print(f"[LOCATION-WARNING] No location column found!")
            
    # Read value if column found, else empty
    master_col_val = str(row[master_col_name]).strip() if master_col_name else ""
    master_clean = master_col_val.lower()
    
    # --- LOGIC BRANCH 1: "SAME AS MARKETING" FALLBACK ---
    # If explicitly "Same as Marketing" -> Look at Marketing column
    if "same as market" in master_clean:
        # Find Marketing column
        marketing_col_name = None
        for col in row.index:
            c_lower = str(col).lower()
            if 'marketing' in c_lower and 'location' in c_lower:
                marketing_col_name = col
                break
        
        if marketing_col_name:
            marketing_val = str(row[marketing_col_name]).strip()
            marketing_clean = marketing_val.lower()
            
            # ERROR CHECK: Circular reference
            if "same as market" in marketing_clean:
                print(f"[ERROR] Circular 'Same as Marketing' reference detected at row {row.name + 1}")
                print(f"[ERROR] Both 'Discount Applies at' and 'Marketing' columns say 'Same as Marketing'")
                return "", ""  # Return empty to skip this row
            
            # Recursively apply logic to Marketing column value
            # Create a temporary row with the marketing value
            temp_row = row.copy()
            temp_row[master_col_name] = marketing_val
            return resolve_location_columns(temp_row)
        else:
            print(f"[ERROR] 'Same as Marketing' specified but Marketing column not found at row {row.name + 1}")
            return "", ""

    # --- LOGIC BRANCH 2: EMPTY OR NAN ---
    if not master_col_val or master_clean == 'nan':
        return "", ""

    # --- LOGIC BRANCH 3: "ALL LOCATIONS EXCEPT" ---
    # If the phrase exists anywhere in the cell, ALL locations become exceptions
    if "all locations except" in master_clean:
        # Remove the trigger phrase to extract location names
        cleaned = master_col_val.replace("All Locations Except:", "").replace("all locations except:", "")
        # Split by comma and extract all location names
        exceptions = [loc.strip() for loc in cleaned.split(',') if loc.strip()]
        
        return "All Locations", ", ".join(exceptions)

    # --- LOGIC BRANCH 4: "ALL LOCATIONS" (Exact or Clean Match) ---
    if master_clean == "all locations":
        return "All Locations", ""

    # --- LOGIC BRANCH 5: SPECIFIC LIST ---
    # If we are here, it's just a list of stores (e.g. "Dixon, Davis")
    return master_col_val, ""


def find_locations_value(row, columns):
    """
    v12.17: Find locations value from row - uses resolve_location_columns for consistency.
    """
    import pandas as pd
    
    # v12.17: Use the same logic as the main matching system
    try:
        loc_raw, exc_raw = resolve_location_columns(row)
        result = format_location_display(loc_raw, exc_raw)
        if result and result.lower() not in ['', '-', 'nan', 'none']:
            print(f"[COMPARE-TO-SHEET] Locations via resolve_location_columns: '{result}'")
            return result
    except Exception as e:
        print(f"[COMPARE-TO-SHEET] resolve_location_columns failed: {e}, falling back")
    
    # Fallback: Priority order for column names
    location_col_names = [
        "Locations (Discount Applies at)",
        "Locations",
        "Location", 
        "Store Locations",
        "Stores"
    ]
    
    def clean_value(val):
        """Clean cell value, handling NaN, None, etc."""
        if val is None:
            return ""
        if pd.isna(val):
            return ""
        s = str(val).strip()
        if s.lower() in ['nan', 'none', 'null', '-']:
            return ""
        return s
    
    # Try exact matches first
    for col_name in location_col_names:
        if col_name in columns:
            val = clean_value(row.get(col_name, ""))
            if val:
                print(f"[COMPARE-TO-SHEET] Found Locations in column '{col_name}': '{val}'")
                return val
    
    # Try case-insensitive partial matches
    for col in columns:
        col_lower = col.lower()
        if "location" in col_lower or "store" in col_lower:
            if "marketing" not in col_lower:  # Skip marketing columns
                val = clean_value(row.get(col, ""))
                if val:
                    print(f"[COMPARE-TO-SHEET] Found Locations in column '{col}': '{val}'")
                    return val
    
    # Log what columns were available for debugging
    location_cols = [c for c in columns if 'location' in c.lower() or 'store' in c.lower()]
    print(f"[COMPARE-TO-SHEET] WARNING: No locations value found!")
    print(f"[COMPARE-TO-SHEET] Available location-like columns: {location_cols}")
    print(f"[COMPARE-TO-SHEET] Defaulting to 'All Locations'")
    return "All Locations"


def convert_store_name_to_data_cy(store_name):
    """
    Convert store display name to data-cy format.
    Example: "The Artist Tree - Koreatown" → "lbl-TheArtistTree-Koreatown"
    """
    # Remove spaces and hyphens between words
    # "The Artist Tree - Koreatown" → "TheArtistTree-Koreatown"
    parts = store_name.split(' - ')
    if len(parts) == 2:
        company_part = parts[0].replace(' ', '')  # "TheArtistTree"
        location_part = parts[1].replace(' ', '')  # "Koreatown"
        result = f"lbl-{company_part}-{location_part}"
    else:
        # Fallback for different formats
        result = f"lbl-{store_name.replace(' ', '').replace('-', '')}"
    
    return result


