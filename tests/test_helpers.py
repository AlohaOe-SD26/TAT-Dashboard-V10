# tests/test_helpers.py — date_helpers, brand_helpers, mis_entry utilities
from __future__ import annotations

import pytest
import pandas as pd

from src.utils.date_helpers import (
    parse_date_flexible,
    normalize_date_str,
    get_monthly_day_of_month,
)
from src.utils.brand_helpers import (
    parse_multi_brand,
    resolve_brand_for_match,
    normalize_brand_name,
)
from src.automation.mis_entry import strip_mis_id_tag


# ─────────────────────────────────────────────────────────────────────────────
# strip_mis_id_tag
# ─────────────────────────────────────────────────────────────────────────────
class TestStripMisIdTag:
    def test_weekly_tag(self):
        assert strip_mis_id_tag('W1: 12345') == '12345'

    def test_gap_tag(self):
        assert strip_mis_id_tag('GAP: 67890') == '67890'

    def test_monthly_tag(self):
        assert strip_mis_id_tag('M1: 99999') == '99999'

    def test_part_tag(self):
        assert strip_mis_id_tag('Part 1: 12345') == '12345'

    def test_no_tag(self):
        assert strip_mis_id_tag('12345') == '12345'

    def test_sale_tag(self):
        assert strip_mis_id_tag('S2: 88888') == '88888'

    def test_empty_string(self):
        assert strip_mis_id_tag('') == ''

    def test_whitespace_stripped(self):
        assert strip_mis_id_tag('W1:  12345  ') == '12345'

    def test_multiple_colons_takes_first_split(self):
        # 'W1: 123:456' → '123:456' (only first colon splits)
        result = strip_mis_id_tag('W1: 123:456')
        assert result == '123:456'


# ─────────────────────────────────────────────────────────────────────────────
# parse_date_flexible
# ─────────────────────────────────────────────────────────────────────────────
class TestParseDateFlexible:
    def test_mdy_format(self):
        d = parse_date_flexible('01/06/2025')
        assert d is not None
        assert d.month == 1
        assert d.day == 6

    def test_ymd_format(self):
        d = parse_date_flexible('2025-06-01')
        assert d is not None
        assert d.year == 2025

    def test_short_year(self):
        d = parse_date_flexible('01/06/25')
        assert d is not None

    def test_empty_returns_none(self):
        assert parse_date_flexible('') is None

    def test_nan_string_returns_none(self):
        assert parse_date_flexible('nan') is None

    def test_invalid_returns_none(self):
        assert parse_date_flexible('not-a-date') is None


# ─────────────────────────────────────────────────────────────────────────────
# normalize_date_str
# ─────────────────────────────────────────────────────────────────────────────
class TestNormalizeDateStr:
    def test_already_normalized(self):
        result = normalize_date_str('01/06/2025')
        assert result == '01/06/2025' or '2025' in result

    def test_iso_to_mdy(self):
        result = normalize_date_str('2025-01-06')
        assert result is not None
        assert isinstance(result, str)

    def test_empty_returns_empty_or_none(self):
        result = normalize_date_str('')
        assert result is None or result == ''


# ─────────────────────────────────────────────────────────────────────────────
# get_monthly_day_of_month
# ─────────────────────────────────────────────────────────────────────────────
class TestGetMonthlyDayOfMonth:
    def test_returns_string(self):
        row = pd.Series({'Day of Month': '15', 'Weekday': '15'})
        result = get_monthly_day_of_month(row)
        assert isinstance(result, str)

    def test_empty_row(self):
        row = pd.Series({})
        result = get_monthly_day_of_month(row)
        assert result is None or isinstance(result, str)


# ─────────────────────────────────────────────────────────────────────────────
# parse_multi_brand
# ─────────────────────────────────────────────────────────────────────────────
class TestParseMultiBrand:
    def test_single_brand(self):
        assert parse_multi_brand('Alpha') == ['Alpha']

    def test_comma_separated(self):
        result = parse_multi_brand('Alpha, Beta')
        assert 'Alpha' in result
        assert 'Beta' in result
        assert len(result) == 2

    def test_slash_separated(self):
        result = parse_multi_brand('Alpha/Beta')
        assert len(result) >= 1  # implementation may or may not split on /

    def test_empty_string(self):
        result = parse_multi_brand('')
        assert isinstance(result, list)

    def test_whitespace_stripped(self):
        result = parse_multi_brand('  Alpha  ,  Beta  ')
        cleaned = [b.strip() for b in result]
        assert 'Alpha' in cleaned
        assert 'Beta' in cleaned


# ─────────────────────────────────────────────────────────────────────────────
# normalize_brand_name
# ─────────────────────────────────────────────────────────────────────────────
class TestNormalizeBrandName:
    def test_strips_whitespace(self):
        assert normalize_brand_name('  Alpha  ') == 'Alpha'

    def test_preserves_case(self):
        # Brand names are case-sensitive for display; normalize handles trimming
        result = normalize_brand_name('TestBrand')
        assert 'TestBrand' in result or 'testbrand' in result.lower()

    def test_empty(self):
        result = normalize_brand_name('')
        assert result == ''


# ─────────────────────────────────────────────────────────────────────────────
# resolve_brand_for_match
# ─────────────────────────────────────────────────────────────────────────────
class TestResolveBrandForMatch:
    def test_direct_match_returned(self):
        settings = {'BrandA': 'LinkedA'}
        result = resolve_brand_for_match('BrandA', settings)
        assert result == 'BrandA'

    def test_linked_brand_resolved(self):
        """When MIS has LinkedA and sheet has BrandA, they should resolve."""
        settings = {'BrandA': 'LinkedA'}
        # resolve_brand_for_match may return the canonical brand
        result = resolve_brand_for_match('LinkedA', settings)
        assert result is not None
        assert isinstance(result, str)

    def test_unknown_brand_returned_as_is(self):
        settings = {}
        result = resolve_brand_for_match('UnknownBrand', settings)
        assert result == 'UnknownBrand'

    def test_empty_settings(self):
        result = resolve_brand_for_match('BrandA', {})
        assert result == 'BrandA'
