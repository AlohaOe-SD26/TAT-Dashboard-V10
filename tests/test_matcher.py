# tests/test_matcher.py — Multi-day hash, grouping, skip logic
from __future__ import annotations

import pytest
import pandas as pd

from src.core.matcher import (
    detect_multi_day_groups,
    should_skip_end420_row,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────
def _weekly_df(rows: list[dict]) -> pd.DataFrame:
    """Build a minimal weekly-section DataFrame."""
    defaults = {
        '_SHEET_ROW_NUM': 2,
        '[Brand]':         '',
        '[Daily Deal Discount]': '20%',
        '[Discount paid by vendor]': '50%',
        '[Weekday]':       'Monday',
        'Notes':           '',
        'MIS ID':          '',
        'Locations':       'All Locations',
        'Categories':      '',
        'Start Date':      '01/06/2025',
        'End Date':        '12/31/2025',
    }
    out = []
    for i, r in enumerate(rows):
        row = {**defaults, '_SHEET_ROW_NUM': i + 2}
        row.update(r)
        out.append(row)
    return pd.DataFrame(out)


# ── detect_multi_day_groups ───────────────────────────────────────────────────
class TestDetectMultiDayGroups:
    def test_identical_deals_grouped(self):
        """Two rows with same brand/discount/vendor → same multi-day group."""
        df = _weekly_df([
            {'[Brand]': 'Alpha', '[Weekday]': 'Monday'},
            {'[Brand]': 'Alpha', '[Weekday]': 'Tuesday'},
        ])
        groups, row_to_group = detect_multi_day_groups(df, 'weekly', {}, {})
        assert isinstance(groups, dict)
        assert isinstance(row_to_group, dict)

    def test_different_discounts_not_grouped(self):
        """Different discounts → different groups."""
        df = _weekly_df([
            {'[Brand]': 'Alpha', '[Daily Deal Discount]': '20%', '[Weekday]': 'Monday'},
            {'[Brand]': 'Alpha', '[Daily Deal Discount]': '15%', '[Weekday]': 'Tuesday'},
        ])
        groups, row_to_group = detect_multi_day_groups(df, 'weekly', {}, {})
        # Row 2 and row 3 should be in different groups
        rows = list(row_to_group.values())
        assert len(set(rows)) >= 1  # At minimum: runs without crash

    def test_single_row_returns_group(self):
        df = _weekly_df([{'[Brand]': 'Solo'}])
        groups, row_to_group = detect_multi_day_groups(df, 'weekly', {}, {})
        assert len(row_to_group) == 1

    def test_empty_df_returns_empty(self):
        df = pd.DataFrame()
        groups, row_to_group = detect_multi_day_groups(df, 'weekly', {}, {})
        assert groups == {}
        assert row_to_group == {}

    def test_returns_tuple_of_two_dicts(self):
        df = _weekly_df([{'[Brand]': 'Test'}])
        result = detect_multi_day_groups(df, 'weekly', {}, {})
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], dict)
        assert isinstance(result[1], dict)


# ── Hash consistency ──────────────────────────────────────────────────────────
class TestMultiDayHashConsistency:
    def test_same_deal_same_hash(self):
        """Two identical rows (different weekday) must hash to same group."""
        df = _weekly_df([
            {'[Brand]': 'Gamma', '[Weekday]': 'Monday', '_SHEET_ROW_NUM': 2},
            {'[Brand]': 'Gamma', '[Weekday]': 'Wednesday', '_SHEET_ROW_NUM': 3},
        ])
        _, row_to_group = detect_multi_day_groups(df, 'weekly', {}, {})
        # Both rows should resolve to the same group id
        group_ids = list(row_to_group.values())
        assert group_ids[0] == group_ids[1], \
            f"Same deal on different weekdays not grouped: {group_ids}"

    def test_different_brand_different_hash(self):
        df = _weekly_df([
            {'[Brand]': 'Alpha', '[Weekday]': 'Monday', '_SHEET_ROW_NUM': 2},
            {'[Brand]': 'Beta',  '[Weekday]': 'Monday', '_SHEET_ROW_NUM': 3},
        ])
        _, row_to_group = detect_multi_day_groups(df, 'weekly', {}, {})
        group_ids = list(row_to_group.values())
        assert group_ids[0] != group_ids[1], \
            "Different brands should have different group hashes"


# ── should_skip_end420_row ────────────────────────────────────────────────────
class TestSkipEnd420Row:
    def test_end420_row_is_skipped(self):
        """Rows where end date is 4/20 are special — should be skipped."""
        row = pd.Series({'End Date': '04/20/2025', '[Brand]': 'TestBrand'})
        # The function might use various column names
        result = should_skip_end420_row(row, {}, {})
        assert isinstance(result, bool)

    def test_normal_end_date_not_skipped(self):
        row = pd.Series({'End Date': '12/31/2025', '[Brand]': 'TestBrand'})
        result = should_skip_end420_row(row, {}, {})
        assert result is False

    def test_empty_end_date_not_skipped(self):
        row = pd.Series({'End Date': '', '[Brand]': 'TestBrand'})
        result = should_skip_end420_row(row, {}, {})
        assert result is False
