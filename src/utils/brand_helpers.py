# =============================================================================
# src/utils/brand_helpers.py
# Step 3: Pure utility extraction from main_-_bloat.py — zero logic changes.
# resolve_brand_for_match() is the ARCHITECTURE RULE: Settings tab always wins.
# Contains: resolve_brand_for_match (authoritative), manage_brand_list, load_brand_settings, get_brand_for_mis_id, parse_multi_brand, is_multi_brand, get_brand_from_mis_id, match_mis_ids_to_brands, format_brand_mis_ids, update_tagged_mis_cell
# =============================================================================
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd

def resolve_brand_for_match(
    row_brand: str,
    brand_settings: Dict[str, str] | None,
    brand_list: List[str] | None = None,
) -> str:
    """
    ARCHITECTURE RULE — Settings Tab Always Wins:
    1. If brand_settings dict is provided and row_brand has an entry → return mapped value.
    2. Else if row_brand is in brand_list → return as-is.
    3. Else → return row_brand unchanged (let fuzzy matching handle it downstream).

    This function is the single authoritative resolver for brand names before
    any fuzzy match or MIS lookup. Never bypass it.

    Args:
        row_brand:      Raw brand string from the Google Sheet row.
        brand_settings: Dict loaded from the Settings tab {brand: mapped_name}.
        brand_list:     Known brand list from brand_list.txt / manage_brand_list().

    Returns:
        Resolved brand string.
    """
    if brand_settings:
        # Exact match first
        if row_brand in brand_settings:
            return brand_settings[row_brand]
        # Case-insensitive fallback
        row_lower = row_brand.lower()
        for k, v in brand_settings.items():
            if k.lower() == row_lower:
                return v
    return row_brand


def manage_brand_list(mis_df: pd.DataFrame) -> List[str]:
    """Manage brand list."""
    stored_brands = set()
    if BRAND_LIST_FILE.exists():
        try:
            with open(BRAND_LIST_FILE, 'r', encoding='utf-8') as f:
                stored_brands = {line.strip() for line in f if line.strip()}
        except:
            pass
    
    mis_brands = set()
    if 'Brand' in mis_df.columns:
        mis_brands = {str(b).strip() for b in mis_df['Brand'].dropna().unique() if str(b).strip()}
    
    new_brands = mis_brands - stored_brands
    if new_brands:
        updated_brands = stored_brands.union(new_brands)
        try:
            with open(BRAND_LIST_FILE, 'w', encoding='utf-8') as f:
                for brand in sorted(updated_brands, key=str.lower):
                    f.write(f"{brand}\n")
        except:
            pass
        return list(updated_brands)
    return list(stored_brands)


def load_brand_settings(spreadsheet_id: str) -> Dict[str, str]:
    """
    Reads a Settings tab to build a map of Brand -> Linked Brand.
    ROBUSTNESS UPGRADES:
    1. Scans first 10 rows for headers (Fuzzy Match).
    2. Handles "Short Rows" (Google API trimming empty trailing cells).
    3. SANITIZATION: Strips whitespace from keys/values for clean matching.
    """
    settings_map = {}
    try:
        service = GLOBAL_DATA['sheets_service']
        if not service: return {}
        
        # 1. Find the Settings tab
        metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        settings_tab_name = None
        
        print("\n[DEBUG] --- Loading Brand Settings ---")
        for s in metadata.get('sheets', []):
            title = s['properties']['title']
            # v12.26.7: Check "Brand Rebate Agreements" tab first, then fall back to Settings
            if 'brand rebate' in title.lower() or 'rebate agreement' in title.lower():
                settings_tab_name = title
                print(f"[DEBUG] Found Brand Rebate Agreements tab: '{title}'")
                break
        
        # Fallback: try Settings tab if no Brand Rebate Agreements tab found
        if not settings_tab_name:
            for s in metadata.get('sheets', []):
                title = s['properties']['title']
                if 'setting' in title.lower():
                    settings_tab_name = title
                    print(f"[DEBUG] Fallback to settings tab: '{title}'")
                    break
        
        if not settings_tab_name:
            print("[WARN] Could not find 'Brand Rebate Agreements' or 'Settings' tab.")
            return {}

        # 2. Fetch data
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{settings_tab_name}'!A1:Z1000" 
        ).execute()
        rows = result.get('values', [])
        if not rows: return {}

        # 3. SCAN FOR HEADERS (Fuzzy Logic)
        brand_idx = -1
        linked_idx = -1
        start_row_index = 0
        
        for i, row in enumerate(rows[:10]):
            row_lower = [str(x).strip().lower() for x in row]
            
            # Find 'Linked Brand' first
            for col_i, cell_val in enumerate(row_lower):
                if 'linked' in cell_val and 'brand' in cell_val:
                    linked_idx = col_i
                    break
            
            # Find 'Brand' second (Generic but NOT linked)
            for col_i, cell_val in enumerate(row_lower):
                if 'brand' in cell_val and 'linked' not in cell_val and 'contribution' not in cell_val:
                    brand_idx = col_i
                    break
            
            if brand_idx != -1 and linked_idx != -1:
                start_row_index = i + 1
                print(f"[DEBUG] Headers found on Row {i+1}: Brand (Col {brand_idx}), Linked (Col {linked_idx})")
                break
        
        if brand_idx == -1 or linked_idx == -1:
            print(f"[WARN] Failed to find headers in '{settings_tab_name}'.")
            return {}

        # 4. Build Map (With SAFE FETCHING)
        count = 0
        for r in rows[start_row_index:]:
            # We only strictly require the BRAND index to exist. 
            # If the row is too short for the Linked Brand index, we assume Linked is empty.
            if len(r) > brand_idx:
                b_name = str(r[brand_idx]).strip()
                
                # SAFE FETCH: Check if row is long enough for linked_idx, else empty string
                l_name = ""
                if len(r) > linked_idx:
                    l_name = str(r[linked_idx]).strip()
                
                if b_name:
                    # Store lowercase key for matching, but keep value clean
                    settings_map[b_name.lower()] = l_name
                    count += 1
                    
        print(f"[INFO] Successfully loaded {count} brand rules.")
        return settings_map

    except Exception as e:
        print(f"[ERROR] Failed to load settings: {e}")
        traceback.print_exc()
        return {}



def get_brand_for_mis_id(mis_id: str, mis_id_column_value: str, brands_column_value: str) -> str:
    """
    v12.18: Given an MIS ID, find which brand it corresponds to in a multi-brand row.
    
    Multi-brand rows in Google Sheet have format:
        MIS ID column: "S1: 966, S2: 967, S3: 968, S4: 969, S5: 970"
        Brands column: "Kiva, Camino, Lost Farm, Terra, Petra"
    
    S1 = first brand, S2 = second brand, etc.
    Also supports W1/W2 (Weekly) and M1/M2 (Monthly) prefixes.
    
    Args:
        mis_id: The MIS ID to look up (e.g., "966")
        mis_id_column_value: The full MIS ID column value (e.g., "S1: 966, S2: 967, ...")
        brands_column_value: The brands column value (e.g., "Kiva, Camino, Lost Farm, ...")
    
    Returns:
        The brand name at the matching position, or None if not found
    """
    import re
    
    if not mis_id or not mis_id_column_value or not brands_column_value:
        return None
    
    # Parse brands list
    brands = [b.strip() for b in brands_column_value.split(',') if b.strip()]
    
    if not brands:
        return None
    
    # If only one brand, return it directly
    if len(brands) == 1:
        return brands[0]
    
    # Find position of our MIS ID using pattern like "S1: 966", "W2: 815", "M3: 500"
    # Pattern matches: letter + number + colon + optional space + our MIS ID
    pattern = r'[SWM](\d+):\s*' + re.escape(str(mis_id).strip())
    match = re.search(pattern, mis_id_column_value, re.IGNORECASE)
    
    if match:
        position = int(match.group(1)) - 1  # Convert to 0-indexed
        if 0 <= position < len(brands):
            print(f"[MULTI-BRAND] MIS ID {mis_id} found at position {position + 1}, brand: {brands[position]}")
            return brands[position]
    
    # Fallback: Try simple position matching by splitting and finding index
    # Handle formats like "S1: 966, S2: 967" by extracting just the IDs
    try:
        # Remove prefixes and get just the IDs
        ids_raw = re.sub(r'[SWM]\d+:\s*', '', mis_id_column_value)
        ids = [i.strip() for i in ids_raw.split(',') if i.strip()]
        
        for idx, id_val in enumerate(ids):
            if str(mis_id).strip() == id_val.strip() and idx < len(brands):
                print(f"[MULTI-BRAND] MIS ID {mis_id} matched at index {idx}, brand: {brands[idx]}")
                return brands[idx]
    except Exception as e:
        print(f"[MULTI-BRAND] Fallback parsing failed: {e}")
    
    print(f"[MULTI-BRAND] Could not determine brand for MIS ID {mis_id} in '{mis_id_column_value}'")
    return None



def parse_multi_brand(brand_str: str) -> List[str]:
    """
    Parse a brand string that may contain multiple brands.
    
    v12.1: Multi-brand support - handles comma-separated brands from dropdown multi-select.
    v12.2: Preserve brands that legitimately contain "&" (Papa & Barkley, Hash & Flowers)
    
    Examples:
        "Stiiizy" -> ["Stiiizy"]
        "Stiiizy, Shryne" -> ["Stiiizy", "Shryne"]
        "Brand A / Brand B" -> ["Brand A", "Brand B"]
        "Papa & Barkley" -> ["Papa & Barkley"]  # Preserved!
        "Hash & Flowers" -> ["Hash & Flowers"]  # Preserved!
    
    Returns: List of individual brand names
    """
    if not brand_str or str(brand_str).strip() in ['', 'nan', 'None', '-']:
        return []
    
    brand_str = str(brand_str).strip()
    
    # v12.2: Known brands that contain "&" - these should NOT be split
    # Use placeholders to preserve them during normalization
    AMPERSAND_BRANDS = [
        'Papa & Barkley',
        'Hash & Flowers',
    ]
    
    # Replace known ampersand brands with placeholders
    preserved = {}
    for i, ab in enumerate(AMPERSAND_BRANDS):
        placeholder = f"__AMPERSAND_BRAND_{i}__"
        # Case-insensitive replacement
        import re
        pattern = re.compile(re.escape(ab), re.IGNORECASE)
        if pattern.search(brand_str):
            # Get the actual matched text to preserve original case
            match = pattern.search(brand_str)
            preserved[placeholder] = match.group(0)
            brand_str = pattern.sub(placeholder, brand_str)
    
    # Normalize separators: / becomes , (but NOT & anymore since we've preserved known brands)
    # Only treat standalone & as separator if it's surrounded by spaces
    import re
    # Replace " / " with comma
    normalized = re.sub(r'\s*/\s*', ', ', brand_str)
    # Replace " & " with comma ONLY if it's not a preserved placeholder
    # Don't replace & at all now - only commas and slashes are separators
    
    # Split on comma and clean up
    brands = [b.strip() for b in normalized.split(',') if b.strip()]
    
    # Restore preserved brands
    result = []
    for b in brands:
        for placeholder, original in preserved.items():
            b = b.replace(placeholder, original)
        result.append(b)
    
    return result



def is_multi_brand(brand_str: str) -> bool:
    """Check if a brand string contains multiple brands."""
    return len(parse_multi_brand(brand_str)) > 1



def get_brand_from_mis_id(mis_id: str, mis_df) -> Optional[str]:
    """
    Look up a MIS ID in the CSV and return the brand name.
    Used to determine which brand a MIS ID belongs to in multi-brand deals.
    """
    if not mis_id or mis_df is None or mis_df.empty:
        return None
    
    mis_id = str(mis_id).strip()
    if mis_id.endswith('.0'):
        mis_id = mis_id[:-2]
    
    # Find ID column
    id_col = None
    for col in ['ID', 'id', 'MIS ID', 'Mis Id']:
        if col in mis_df.columns:
            id_col = col
            break
    
    if not id_col:
        return None
    
    # Search for the ID
    matches = mis_df[mis_df[id_col].astype(str).str.strip() == mis_id]
    
    if matches.empty:
        return None
    
    return str(matches.iloc[0].get('Brand', '')).strip()



def match_mis_ids_to_brands(mis_id_cell: str, brands: List[str], mis_df) -> Dict[str, List]:
    """
    Given a MIS ID cell with multiple IDs and a list of brands,
    match each MIS ID to its corresponding brand by looking up in CSV.
    
    v12.2: Uses strict matching to avoid confusing similar brands
           (e.g., "Stiiizy" vs "Stiiizy Accessories")
    
    Args:
        mis_id_cell: The MIS ID cell content (e.g., "W1: 12345\\nW1: 67890\\nW2: 11111\\nW2: 22222")
        brands: List of brand names (e.g., ["Stiiizy", "Stiiizy Accessories"])
        mis_df: The MIS CSV DataFrame
    
    Returns:
        Dict mapping brand name to list of (tag, id) tuples
        e.g., {"Stiiizy": [("W1", "919")], 
               "Stiiizy Accessories": [("W1", "920")]}
    """
    parsed = parse_mis_id_cell(mis_id_cell)
    all_tagged = parsed.get('all_tagged', [])
    
    result = {brand: [] for brand in brands}
    unmatched = []
    
    for tag, mis_id in all_tagged:
        csv_brand = get_brand_from_mis_id(mis_id, mis_df)
        
        if csv_brand:
            csv_brand_lower = csv_brand.lower().strip()
            matched = False
            
            # v12.2: STRICT MATCHING - prioritize exact matches first
            # This prevents "Stiiizy" from matching "Stiiizy Accessories"
            
            # Pass 1: Exact match (case-insensitive)
            for brand in brands:
                if csv_brand_lower == brand.lower().strip():
                    result[brand].append((tag, mis_id))
                    matched = True
                    break
            
            # Pass 2: If no exact match, check for partial containment carefully
            # Only match if csv_brand contains the sheet brand AND they're "close enough"
            # But NOT if one is a substring of the other with extra words
            if not matched:
                for brand in brands:
                    brand_lower = brand.lower().strip()
                    
                    # Skip if one contains the other but they're not equal
                    # This prevents "Stiiizy" matching "Stiiizy Accessories"
                    if brand_lower in csv_brand_lower and brand_lower != csv_brand_lower:
                        continue
                    if csv_brand_lower in brand_lower and brand_lower != csv_brand_lower:
                        continue
                    
                    # Fuzzy match only for completely different spellings
                    # (e.g., typos, slight variations)
                    ratio = fuzz.token_set_ratio(csv_brand_lower, brand_lower)
                    if ratio >= 95:  # Very high threshold for non-exact matches
                        result[brand].append((tag, mis_id))
                        matched = True
                        break
            
            if not matched:
                unmatched.append((tag, mis_id, csv_brand))
        else:
            unmatched.append((tag, mis_id, None))
    
    # Add unmatched to a special key
    if unmatched:
        result['_unmatched'] = unmatched
    
    return result



def format_brand_mis_ids(tagged_ids: List[tuple]) -> str:
    """
    Format a list of (tag, id) tuples back into a cell string.
    e.g., [("W1", "12345"), ("W2", "67890")] -> "W1: 12345, W2: 67890"
    """
    if not tagged_ids:
        return ''
    return ', '.join([f"{tag}: {mid}" for tag, mid in tagged_ids])



def update_tagged_mis_cell(existing_content: str, tag: str, new_id: str, append_mode: bool = False) -> str:
    """
    Update a specific tag in a MIS ID cell, preserving other content.
    
    v10.8: Section-based tags
    tag: 'w1', 'w2', 'wp', 'm1', 'm2', 'mp', 's1', 's2', 'sp'
         (also accepts legacy: 'part1', 'part2', 'gap', 'patch')
    new_id: The MIS ID to set
    append_mode: v12.1 - If True, always append new line even if tag exists (for multi-brand)
    
    If tag already exists and append_mode=False, updates it. Otherwise, appends it.
    """
    if not new_id or not new_id.strip():
        return existing_content
    
    new_id = str(new_id).strip()
    tag_lower = tag.lower().strip()
    
    # Strip any existing tag from the MIS ID (in case it was passed with a tag)
    new_id = strip_mis_id_tag(new_id)
    
    # Parse existing content
    existing_lines = []
    if existing_content:
        existing_lines = [l.strip() for l in existing_content.replace('\r\n', '\n').split('\n') if l.strip()]
    
    # Determine the tag prefix to look for and the line to add
    # v10.8: New format (W1, W2, WP, M1, M2, MP, S1, S2, SP)
    new_line = ''
    tag_prefix = ''
    
    if tag_lower in ['w1', 'weekly1', 'weekly_1']:
        new_line = f"W1: {new_id}"
        tag_prefix = 'w1'
    elif tag_lower in ['w2', 'weekly2', 'weekly_2']:
        new_line = f"W2: {new_id}"
        tag_prefix = 'w2'
    elif tag_lower in ['w3', 'weekly3', 'weekly_3']:
        new_line = f"W3: {new_id}"
        tag_prefix = 'w3'
    elif tag_lower in ['wp', 'weekly_patch', 'weeklypatch']:
        new_line = f"WP: {new_id}"
        tag_prefix = 'wp'
    elif tag_lower in ['m1', 'monthly1', 'monthly_1']:
        new_line = f"M1: {new_id}"
        tag_prefix = 'm1'
    elif tag_lower in ['m2', 'monthly2', 'monthly_2']:
        new_line = f"M2: {new_id}"
        tag_prefix = 'm2'
    elif tag_lower in ['m3', 'monthly3', 'monthly_3']:
        new_line = f"M3: {new_id}"
        tag_prefix = 'm3'
    elif tag_lower in ['mp', 'monthly_patch', 'monthlypatch']:
        new_line = f"MP: {new_id}"
        tag_prefix = 'mp'
    elif tag_lower in ['s1', 'sale1', 'sale_1']:
        new_line = f"S1: {new_id}"
        tag_prefix = 's1'
    elif tag_lower in ['s2', 'sale2', 'sale_2']:
        new_line = f"S2: {new_id}"
        tag_prefix = 's2'
    elif tag_lower in ['s3', 'sale3', 'sale_3']:
        new_line = f"S3: {new_id}"
        tag_prefix = 's3'
    elif tag_lower in ['sp', 'sale_patch', 'salepatch']:
        new_line = f"SP: {new_id}"
        tag_prefix = 'sp'
    # Legacy support
    elif tag_lower in ['part1', 'part_1', 'part 1']:
        new_line = f"W1: {new_id}"
        tag_prefix = 'w1'
    elif tag_lower in ['part2', 'part_2', 'part 2']:
        new_line = f"W2: {new_id}"
        tag_prefix = 'w2'
    elif tag_lower in ['gap']:
        # GAP is deprecated but convert to appropriate section if known
        new_line = f"M1: {new_id}"  # Assume monthly for legacy GAP
        tag_prefix = 'm1'
    elif tag_lower in ['patch']:
        new_line = f"WP: {new_id}"  # Assume weekly patch for legacy
        tag_prefix = 'wp'
    else:
        # Unknown tag - just add as W1
        new_line = f"W1: {new_id}"
        tag_prefix = 'w1'
    
    # Look for existing line with same tag and replace (unless append_mode), or append
    found = False
    result_lines = []
    
    for line in existing_lines:
        line_lower = line.lower()
        # Check if this line has the same tag prefix
        if line_lower.startswith(tag_prefix + ':') or line_lower.startswith(tag_prefix + ' :'):
            if append_mode:
                # v12.1: In append mode, keep existing line AND add new one later
                result_lines.append(line)
            else:
                # Replace mode: replace existing line with new one
                result_lines.append(new_line)
                found = True
        else:
            result_lines.append(line)
    
    if not found or append_mode:
        result_lines.append(new_line)
    
    return '\n'.join(result_lines)


