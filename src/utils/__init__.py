# src/utils/__init__.py
# Public API for the utils package.
# Import from here rather than individual modules for cleaner call sites.

from src.utils.date_helpers import (
    get_monthly_day_of_month,
    parse_end_date,
    parse_tab_month_year,
    expand_weekday_to_dates,
    parse_monthly_dates,
    parse_sale_dates,
    get_all_weekdays_for_multiday_group,
    filter_mis_by_date,
    parse_monthly_ordinals,
    parse_sale_dates_for_validation,
    calculate_expected_dates,
    check_mis_weekday_active,
)

from src.utils.location_helpers import (
    parse_locations,
    resolve_to_store_set,
    calculate_location_conflict,
    format_location_set,
    format_location_display,
    format_csv_locations,
    resolve_location_columns,
    find_locations_value,
    convert_store_name_to_data_cy,
)

from src.utils.brand_helpers import (
    resolve_brand_for_match,   # ARCHITECTURE RULE: Settings tab always wins
    manage_brand_list,
    load_brand_settings,
    get_brand_for_mis_id,
    parse_multi_brand,
    is_multi_brand,
    get_brand_from_mis_id,
    match_mis_ids_to_brands,
    format_brand_mis_ids,
    update_tagged_mis_cell,
)

from src.utils.fuzzy import (
    compute_match_score,        # Canonical scorer: Brand 50 / Disc 30 / Vendor 15 / Cat 5
    generate_fuzzy_suggestions,
)

from src.utils.csv_resolver import (
    resolve_mis_csv,
    load_sync_keys,
)

from src.utils.logger import get_logger, console_log

__all__ = [
    # date
    'get_monthly_day_of_month', 'parse_end_date', 'parse_tab_month_year',
    'expand_weekday_to_dates', 'parse_monthly_dates', 'parse_sale_dates',
    'get_all_weekdays_for_multiday_group', 'filter_mis_by_date',
    'parse_monthly_ordinals', 'parse_sale_dates_for_validation',
    'calculate_expected_dates', 'check_mis_weekday_active',
    # location
    'parse_locations', 'resolve_to_store_set', 'calculate_location_conflict',
    'format_location_set', 'format_location_display', 'format_csv_locations',
    'resolve_location_columns', 'find_locations_value', 'convert_store_name_to_data_cy',
    # brand
    'resolve_brand_for_match', 'manage_brand_list', 'load_brand_settings',
    'get_brand_for_mis_id', 'parse_multi_brand', 'is_multi_brand',
    'get_brand_from_mis_id', 'match_mis_ids_to_brands', 'format_brand_mis_ids',
    'update_tagged_mis_cell',
    # fuzzy
    'compute_match_score', 'generate_fuzzy_suggestions',
    # csv
    'resolve_mis_csv', 'load_sync_keys',
    # logger
    'get_logger', 'console_log',
]
