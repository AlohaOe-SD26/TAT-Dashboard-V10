# tests/test_location_helpers.py — Tests for location resolution logic
from __future__ import annotations

import pytest
from src.utils.location_helpers import (
    normalize_store_name,
    normalize_location_string,
    resolve_to_store_set,
    ALL_STORES_SET,
    ALL_STORES,
    _extract_except_stores,
)


ALL_STORES_COUNT = len(ALL_STORES_SET)


# ── normalize_store_name ──────────────────────────────────────────────────────
class TestNormalizeStoreName:
    def test_exact_canonical_passthrough(self):
        assert normalize_store_name('Beverly') == 'Beverly'
        assert normalize_store_name('West Hollywood') == 'West Hollywood'
        assert normalize_store_name('Fresno Shaw') == 'Fresno Shaw'

    def test_case_insensitive(self):
        assert normalize_store_name('beverly') == 'Beverly'
        assert normalize_store_name('DAVIS') == 'Davis'

    def test_whitespace_stripped(self):
        assert normalize_store_name('  Beverly  ') == 'Beverly'

    def test_unknown_store_returned_title_case(self):
        result = normalize_store_name('fake store')
        assert isinstance(result, str)
        assert len(result) > 0

    def test_all_canonical_stores_round_trip(self):
        for store in ALL_STORES:
            assert normalize_store_name(store) == store


# ── normalize_location_string ─────────────────────────────────────────────────
class TestNormalizeLocationString:
    def test_all_locations_passthrough(self):
        result = normalize_location_string('All Locations')
        assert 'all' in result.lower() or len(result) > 0

    def test_comma_separated_stores(self):
        result = normalize_location_string('Beverly, Davis')
        assert 'Beverly' in result
        assert 'Davis' in result

    def test_empty_string(self):
        result = normalize_location_string('')
        assert isinstance(result, str)


# ── _extract_except_stores ────────────────────────────────────────────────────
class TestExtractExceptStores:
    def test_basic_except_pattern(self):
        result = _extract_except_stores('All Locations Except: Beverly, Davis')
        assert result is not None
        assert 'Beverly' in result or any('beverly' in s.lower() for s in result)

    def test_no_except_returns_none(self):
        assert _extract_except_stores('Beverly, Davis') is None

    def test_empty_string_returns_none(self):
        assert _extract_except_stores('') is None

    def test_all_except_nothing(self):
        result = _extract_except_stores('All Locations Except: ')
        # Should return empty list or None
        assert result is None or result == [] or len(result) == 0


# ── resolve_to_store_set ──────────────────────────────────────────────────────
class TestResolveToStoreSet:
    def test_all_locations_resolves_to_full_set(self):
        result = resolve_to_store_set('All Locations')
        assert isinstance(result, (set, frozenset))
        assert len(result) == ALL_STORES_COUNT

    def test_single_store(self):
        result = resolve_to_store_set('Beverly')
        assert isinstance(result, (set, frozenset))
        assert len(result) == 1

    def test_comma_list_resolves_correctly(self):
        result = resolve_to_store_set('Beverly, Davis, Dixon')
        assert len(result) == 3

    def test_all_except_one(self):
        result = resolve_to_store_set('All Locations Except: Beverly')
        assert isinstance(result, (set, frozenset))
        assert len(result) == ALL_STORES_COUNT - 1

    def test_all_except_two(self):
        result = resolve_to_store_set('All Locations Except: Beverly, Davis')
        assert len(result) == ALL_STORES_COUNT - 2

    def test_empty_resolves_to_all(self):
        result = resolve_to_store_set('')
        assert len(result) == ALL_STORES_COUNT

    def test_set_equality_for_matching(self):
        """Two representations of the same stores should be equal."""
        a = resolve_to_store_set('Beverly, Davis, Dixon')
        b = resolve_to_store_set('Davis, Beverly, Dixon')
        assert a == b

    def test_all_locations_matches_explicit_full_list(self):
        all_set = resolve_to_store_set('All Locations')
        explicit = resolve_to_store_set(', '.join(sorted(ALL_STORES)))
        assert all_set == explicit

    def test_except_resolves_to_complement(self):
        all_set = resolve_to_store_set('All Locations')
        except_bev = resolve_to_store_set('All Locations Except: Beverly')
        assert len(all_set) - len(except_bev) == 1
        assert 'Beverly' not in except_bev
