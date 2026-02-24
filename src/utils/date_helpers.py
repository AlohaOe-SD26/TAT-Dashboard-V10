# =============================================================================
# src/utils/date_helpers.py
# Step 3: Pure utility extraction from main_-_bloat.py — zero logic changes.
# Contains: get_monthly_day_of_month, parse_end_date, parse_tab_month_year, expand_weekday_to_dates, parse_monthly_dates, parse_sale_dates, get_all_weekdays_for_multiday_group, filter_mis_by_date, parse_monthly_ordinals, parse_sale_dates_for_validation, calculate_expected_dates, check_mis_weekday_active
# =============================================================================
import re
from pathlib import Path
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd

def get_monthly_day_of_month(row: pd.Series) -> str:
    """
    v12.25.6: Get day of month for Monthly section deals.
    
    Searches for column containing "Contracted Duration" in header.
    Returns values like "10th", "15th", etc.
    
    NOTE: Column A may contain detailed date information in comma-separated format
    for multi-day deals - this is handled separately by multi-day grouping logic.
    """
    # Search for "Contracted Duration" in header (case-insensitive)
    for col in row.index:
        col_str = str(col)
        c_lower = col_str.lower().replace('\n', ' ')  # Normalize newlines
        if 'contracted duration' in c_lower:
            val = row[col]
            if pd.notna(val):
                result = str(val).strip()
                print(f"[MONTHLY-DAY] Found 'Contracted Duration' column '{col_str}' with value: '{result}'")
                return result
    
    # Fallback to old column names for backwards compatibility
    fallback_names = ['Weekday/ Day of Month', 'Day of Month', 'Monthly Day']
    for name in fallback_names:
        if name in row.index and pd.notna(row[name]):
            result = str(row[name]).strip()
            print(f"[MONTHLY-DAY] Using fallback column '{name}' with value: '{result}'")
            return result
    
    print(f"[MONTHLY-DAY-WARNING] No day-of-month column found!")
    return ''


def parse_end_date(contracted_duration: str, default: str = '') -> Tuple[str, str]:
    if not contracted_duration or pd.isna(contracted_duration):
        return (default, default)
    parts = str(contracted_duration).split('-')
    if len(parts) == 2:
        return (parts[0].strip(), parts[1].strip())
    return (default, default)


def parse_tab_month_year(tab_name: str) -> Tuple[int, int]:
    """
    Parse tab name (e.g., "December 2025", "Jan 2026", "Dec 25") to extract month and year.
    Returns: (month_number, year) or (current_month, current_year) as fallback
    """
    import calendar
    from datetime import datetime
    
    # Default to current month/year
    now = datetime.now()
    default_month, default_year = now.month, now.year
    
    if not tab_name:
        return (default_month, default_year)
    
    tab_clean = tab_name.strip()
    
    # Month name mappings (full and abbreviated)
    month_names = {
        'january': 1, 'jan': 1,
        'february': 2, 'feb': 2,
        'march': 3, 'mar': 3,
        'april': 4, 'apr': 4,
        'may': 5,
        'june': 6, 'jun': 6,
        'july': 7, 'jul': 7,
        'august': 8, 'aug': 8,
        'september': 9, 'sep': 9, 'sept': 9,
        'october': 10, 'oct': 10,
        'november': 11, 'nov': 11,
        'december': 12, 'dec': 12
    }
    
    # Try to extract month and year
    import re
    
    # Pattern 1: "December 2025" or "Dec 2025"
    match = re.search(r'([a-zA-Z]+)\s*(\d{4})', tab_clean)
    if match:
        month_str = match.group(1).lower()
        year = int(match.group(2))
        if month_str in month_names:
            return (month_names[month_str], year)
    
    # Pattern 2: "Dec 25" or "December 25" (assume 20XX)
    match = re.search(r'([a-zA-Z]+)\s*(\d{2})$', tab_clean)
    if match:
        month_str = match.group(1).lower()
        year_short = int(match.group(2))
        year = 2000 + year_short if year_short < 100 else year_short
        if month_str in month_names:
            return (month_names[month_str], year)
    
    # Pattern 3: Just month name (use current or next year)
    for month_str, month_num in month_names.items():
        if month_str in tab_clean.lower():
            # If the month is in the past this year, assume next year
            if month_num < now.month:
                return (month_num, now.year + 1)
            return (month_num, now.year)
    
    return (default_month, default_year)


def expand_weekday_to_dates(weekday_str: str, target_month: int, target_year: int) -> List[date]:
    """
    For Weekly deals: Convert day name (e.g., "Monday", "Tue") to all dates in the target month.
    Returns: List of datetime.date objects for all occurrences of that weekday in the month.
    """
    import calendar
    from datetime import date
    
    if not weekday_str or weekday_str.strip().lower() in ['', 'nan', 'none', '-']:
        return []
    
    # Weekday mappings (0=Monday, 6=Sunday)
    weekday_map = {
        'monday': 0, 'mon': 0, 'mo': 0,
        'tuesday': 1, 'tue': 1, 'tu': 1, 'tues': 1,
        'wednesday': 2, 'wed': 2, 'we': 2,
        'thursday': 3, 'thu': 3, 'th': 3, 'thur': 3, 'thurs': 3,
        'friday': 4, 'fri': 4, 'fr': 4,
        'saturday': 5, 'sat': 5, 'sa': 5,
        'sunday': 6, 'sun': 6, 'su': 6
    }
    
    day_key = weekday_str.strip().lower()
    if day_key not in weekday_map:
        return []
    
    target_weekday = weekday_map[day_key]
    
    # Get all days in the target month
    num_days = calendar.monthrange(target_year, target_month)[1]
    result_dates = []
    
    for day in range(1, num_days + 1):
        d = date(target_year, target_month, day)
        if d.weekday() == target_weekday:
            result_dates.append(d)
    
    return result_dates


def parse_monthly_dates(date_str: str, target_month: int, target_year: int) -> List[date]:
    """
    For Monthly deals: Parse ordinals ("10th", "1st, 15th") or date formats ("12/25/25").
    Returns: List of datetime.date objects.
    """
    import re
    from datetime import date
    import calendar
    
    if not date_str or date_str.strip().lower() in ['', 'nan', 'none', '-']:
        return []
    
    result_dates = []
    date_clean = date_str.strip()
    
    # Split by common delimiters: comma, &, "and"
    parts = re.split(r'[,&]|\band\b', date_clean, flags=re.IGNORECASE)
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Pattern 1: Ordinal numbers ("1st", "2nd", "3rd", "10th", "21st")
        ordinal_match = re.search(r'(\d+)(?:st|nd|rd|th)', part, re.IGNORECASE)
        if ordinal_match:
            day = int(ordinal_match.group(1))
            num_days = calendar.monthrange(target_year, target_month)[1]
            if 1 <= day <= num_days:
                result_dates.append(date(target_year, target_month, day))
            continue
        
        # Pattern 2: Full date "MM/DD/YY" or "MM/DD/YYYY" or "MM-DD-YY"
        date_match = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', part)
        if date_match:
            month = int(date_match.group(1))
            day = int(date_match.group(2))
            year = int(date_match.group(3))
            if year < 100:
                year = 2000 + year
            try:
                result_dates.append(date(year, month, day))
            except ValueError:
                pass  # Invalid date
            continue
        
        # Pattern 3: Just a number (assume day of target month)
        num_match = re.search(r'^(\d+)$', part)
        if num_match:
            day = int(num_match.group(1))
            num_days = calendar.monthrange(target_year, target_month)[1]
            if 1 <= day <= num_days:
                result_dates.append(date(target_year, target_month, day))
    
    return result_dates


def parse_sale_dates(date_str: str, target_month: int, target_year: int) -> List[date]:
    """
    For Sale deals: Parse formats like "12/24/25 - Wednesday", "12/31/25 - Wednesday".
    Extracts the date portion, ignoring the day name suffix.
    Returns: List of datetime.date objects.
    """
    import re
    from datetime import date
    
    if not date_str or date_str.strip().lower() in ['', 'nan', 'none', '-']:
        return []
    
    result_dates = []
    date_clean = date_str.strip()
    
    # Split by common delimiters: comma, &, "and"
    parts = re.split(r'[,&]|\band\b', date_clean, flags=re.IGNORECASE)
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Pattern 1: "MM/DD/YY - DayName" or "MM/DD/YYYY - DayName"
        # Extract just the date portion before the dash+day
        date_match = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', part)
        if date_match:
            month = int(date_match.group(1))
            day = int(date_match.group(2))
            year = int(date_match.group(3))
            if year < 100:
                year = 2000 + year
            try:
                result_dates.append(date(year, month, day))
            except ValueError:
                pass  # Invalid date
            continue
        
        # Pattern 2: Ordinal ("25th", "1st") - treat as target month
        ordinal_match = re.search(r'(\d+)(?:st|nd|rd|th)', part, re.IGNORECASE)
        if ordinal_match:
            day_num = int(ordinal_match.group(1))
            import calendar
            num_days = calendar.monthrange(target_year, target_month)[1]
            if 1 <= day_num <= num_days:
                result_dates.append(date(target_year, target_month, day_num))
    
    return result_dates


def get_all_weekdays_for_multiday_group(group_data: Dict, section_df: pd.DataFrame, section_key: str, target_month: int, target_year: int) -> List[date]:
    """
    For a multi-day group (e.g., Stiiizy Mon/Tue/Wed), expand ALL weekdays to actual dates.
    Returns: Combined list of dates from all weekdays in the group.
    """
    all_dates = []
    weekdays = group_data.get('weekdays', [])
    
    for weekday in weekdays:
        if weekday and weekday != '[!] ⚠️⚠️  MISSING':
            dates = expand_weekday_to_dates(weekday, target_month, target_year)
            all_dates.extend(dates)
    
    return list(set(all_dates))  # Remove duplicates


def filter_mis_by_date(df: pd.DataFrame, date_str: str, expand_month: bool) -> pd.DataFrame:
    """
    Filters the MIS DataFrame based on the 'Start date' column.
    Args:
        df: The dataframe to filter.
        date_str: The target date string (YYYY-MM-DD from HTML input).
        expand_month: If True, matches Month/Year. If False, matches exact Date.
    """
    if df.empty or 'Start date' not in df.columns:
        return df
    
    try:
        # Parse user input
        target_date = datetime.strptime(date_str, '%Y-%m-%d')
        
        # Convert DF column to datetime objects (handling errors gracefully)
        temp_dates = pd.to_datetime(df['Start date'], errors='coerce')
        
        if expand_month:
            # Filter by Month AND Year
            mask = (temp_dates.dt.month == target_date.month) & \
                   (temp_dates.dt.year == target_date.year)
            filter_desc = f"Month: {target_date.strftime('%B %Y')}"
        else:
            # Filter by exact Date
            mask = (temp_dates.dt.date == target_date.date())
            filter_desc = f"Date: {target_date.strftime('%Y-%m-%d')}"
            
        filtered_df = df[mask]
        print(f"[FILTER] Applied Focus. Criteria: {filter_desc}. Rows: {len(df)} -> {len(filtered_df)}")
        
        return filtered_df
        
    except Exception as e:
        print(f"[ERROR] Date filtering failed: {e}")
        traceback.print_exc()
        return df


def parse_monthly_ordinals(day_str: str) -> list:
    """
    v12.12.12: Parse monthly ordinal strings like "1st", "10th", "1st, 15th"
    Returns list of day numbers: [1, 15]
    """
    import re
    
    if not day_str:
        return []
    
    # Find all ordinal patterns: 1st, 2nd, 3rd, 4th, 5th, etc.
    ordinal_pattern = r'(\d+)(?:st|nd|rd|th)'
    matches = re.findall(ordinal_pattern, day_str.lower())
    
    days = [int(m) for m in matches if 1 <= int(m) <= 31]
    print(f"[COMPARE-TO-SHEET] Parsed monthly ordinals: '{day_str}' -> days {days}")
    return days


def parse_sale_dates_for_validation(sale_str: str) -> list:
    """
    v12.12.12: Parse sale date strings like "01/16/26 - Friday" or "01/16/26 - Friday, 01/17/26 - Saturday"
    Returns list of dicts: [{'date': '01/16/26', 'weekday': 'Friday', 'date_obj': date}, ...]
    
    NOTE: This is separate from parse_sale_dates() at line ~3325 which takes 3 args and returns List[date]
    for the Split Audit date expansion. This function is for validation comparison only.
    """
    import re
    from datetime import datetime
    
    if not sale_str:
        return []
    
    results = []
    
    # Pattern: MM/DD/YY - Weekday
    pattern = r'(\d{1,2}/\d{1,2}/\d{2,4})\s*-\s*(\w+)'
    matches = re.findall(pattern, sale_str)
    
    for date_str, weekday in matches:
        try:
            # Parse date (handle 2-digit and 4-digit years)
            if len(date_str.split('/')[-1]) == 2:
                date_obj = datetime.strptime(date_str, '%m/%d/%y').date()
            else:
                date_obj = datetime.strptime(date_str, '%m/%d/%Y').date()
            
            results.append({
                'date': date_str,
                'weekday': weekday.strip().title(),
                'date_obj': date_obj
            })
        except ValueError as e:
            print(f"[COMPARE-TO-SHEET] Warning: Could not parse sale date '{date_str}': {e}")
    
    print(f"[COMPARE-TO-SHEET] Parsed sale dates: '{sale_str}' -> {len(results)} dates")
    return results


def calculate_expected_dates(section_type: str, date_value: str, tab_name: str) -> dict:
    """
    v12.12.12: Calculate expected dates/weekdays based on section type.
    
    Returns dict with:
    - 'all_entries': List of all expected entries from Google Sheet
    - 'weekday': Weekday string for MIS (for weekly deals, direct; for monthly/sale, calculated)
    """
    from datetime import date, timedelta
    import calendar
    
    result = {
        'all_entries': [],
        'weekday': '',
        'section_type': section_type,
        'raw_value': date_value
    }
    
    if section_type == 'weekly':
        # Weekly deals: weekday is used directly
        result['weekday'] = date_value
        result['all_entries'] = [{'weekday': date_value, 'type': 'weekly'}]
        return result
    
    # Get month/year from tab name
    tab_month, tab_year = parse_tab_month_year(tab_name)
    print(f"[COMPARE-TO-SHEET] Tab '{tab_name}' -> Month: {tab_month}, Year: {tab_year}")
    
    if section_type == 'monthly':
        # Parse ordinal days
        days = parse_monthly_ordinals(date_value)
        
        for day in days:
            try:
                # Create date for this day in the target month
                entry_date = date(tab_year, tab_month, day)
                weekday_name = calendar.day_name[entry_date.weekday()]
                
                result['all_entries'].append({
                    'day': day,
                    'ordinal': f"{day}{'st' if day == 1 else 'nd' if day == 2 else 'rd' if day == 3 else 'th'}",
                    'date': entry_date.strftime('%m/%d/%Y'),
                    'date_short': entry_date.strftime('%m/%d/%y'),
                    'weekday': weekday_name,
                    'type': 'monthly'
                })
            except ValueError as e:
                print(f"[COMPARE-TO-SHEET] Warning: Invalid date - day {day} in {tab_month}/{tab_year}: {e}")
        
        # Set weekday to comma-separated list of all expected weekdays
        all_weekdays = [e['weekday'] for e in result['all_entries']]
        result['weekday'] = ', '.join(all_weekdays) if all_weekdays else ''
        
    elif section_type == 'sale':
        # Parse sale date strings
        sale_dates = parse_sale_dates_for_validation(date_value)
        
        for sd in sale_dates:
            result['all_entries'].append({
                'date': sd['date'],
                'date_obj': sd['date_obj'],
                'weekday': sd['weekday'],
                'type': 'sale'
            })
        
        # Set weekday to comma-separated list of all expected weekdays
        all_weekdays = list(set([e['weekday'] for e in result['all_entries']]))
        result['weekday'] = ', '.join(sorted(all_weekdays)) if all_weekdays else ''
    
    print(f"[COMPARE-TO-SHEET] Calculated {len(result['all_entries'])} expected entries for {section_type}")
    return result


def check_mis_weekday_active(target_date: date, mis_weekday_str: str) -> bool:
    """
    Checks if a specific date's day-of-week is present in the MIS Weekday column.
    Example: target_date=Dec 25 (Thursday). mis_str="Mon, Wed, Fri". Returns False.
    """
    if not mis_weekday_str or str(mis_weekday_str).lower() in ['nan', 'none', '', '-']:
        return False # No weekdays listed = Not active? Or assume all? Usually specific.
        
    # Get day name from date (e.g., 'Thursday')
    target_day_full = target_date.strftime('%A').lower() # thursday
    target_day_abbr = target_date.strftime('%a').lower() # thu
    
    # MIS formats usually: "Monday", "Mon", "Mon, Wed", "Monday, Wednesday"
    mis_clean = str(mis_weekday_str).lower()
    
    # Simple check: is 'thu' or 'thursday' in the string?
    # We map standard days to ensure we don't partial match 'mon' inside 'month' (unlikely but safe)
    day_map = {
        'monday': ['mon', 'monday'],
        'tuesday': ['tue', 'tues', 'tuesday'],
        'wednesday': ['wed', 'wednesday'],
        'thursday': ['thu', 'thur', 'thurs', 'thursday'],
        'friday': ['fri', 'friday'],
        'saturday': ['sat', 'saturday'],
        'sunday': ['sun', 'sunday']
    }
    
    valid_tokens = day_map.get(target_day_full, [])
    
    for token in valid_tokens:
        if token in mis_clean:
            return True
            
    return False



def normalize_date(date_str: str | None) -> str:
    """
    Normalize a date string to MM/DD/YYYY format.
    Accepts: 'MM/DD/YY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'Jan 15, 2025', etc.
    Returns: 'MM/DD/YYYY' or '' on failure.
    """
    if not date_str:
        return ''
    date_str = str(date_str).strip()
    if not date_str:
        return ''

    from datetime import datetime
    formats = [
        '%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d',
        '%B %d, %Y', '%b %d, %Y', '%b %d %Y',
        '%m-%d-%Y', '%m-%d-%y',
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime('%m/%d/%Y')
        except ValueError:
            continue
    return date_str  # Return as-is if we can't parse it
