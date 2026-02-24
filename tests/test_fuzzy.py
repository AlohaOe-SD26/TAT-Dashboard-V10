# tests/test_fuzzy.py — Unit tests for compute_match_score
# Architecture rule: Brand 50pts / Discount 30pts / Vendor 15pts / Category 5pts
from __future__ import annotations

import pytest
from src.utils.fuzzy import compute_match_score


# ── Helpers ───────────────────────────────────────────────────────────────────
def _score(
    exp_brand: str, exp_disc: str, exp_vend: str,
    can_brand: str, can_disc: str, can_vend: str,
    can_cat: str = '',
    brand_settings: dict | None = None,
) -> int:
    expected  = {'brand': exp_brand, 'discount': exp_disc, 'vendor_contrib': exp_vend, 'category': ''}
    candidate = {'brand': can_brand, 'discount': can_disc, 'vendor_contrib': can_vend, 'category': can_cat}
    return compute_match_score(expected, candidate, brand_settings or {})


# ── Perfect match ─────────────────────────────────────────────────────────────
class TestPerfectMatch:
    def test_identical_returns_100(self):
        s = _score('TestBrand', '20', '50', 'TestBrand', '20', '50')
        assert s == 100

    def test_identical_with_percent_signs(self):
        s = _score('TestBrand', '20%', '50%', 'TestBrand', '20%', '50%')
        assert s == 100

    def test_case_insensitive_brand(self):
        s = _score('testbrand', '20', '50', 'TESTBRAND', '20', '50')
        assert s >= 95  # token_set_ratio handles case


# ── Brand scoring (max 50) ────────────────────────────────────────────────────
class TestBrandScoring:
    def test_exact_brand_contributes_50(self):
        exact   = _score('Alpha', '20', '50', 'Alpha', '20', '50')
        no_brand = _score('Alpha', '20', '50', 'Omega', '20', '50')
        assert exact - no_brand >= 40  # brand dominates

    def test_linked_brand_bonus(self):
        """Brand match via linked brand mapping earns +5 bonus."""
        settings = {'TestBrand': 'LinkedBrand'}
        with_link = _score('TestBrand', '20', '50', 'LinkedBrand', '20', '50', brand_settings=settings)
        without   = _score('TestBrand', '20', '50', 'OtherBrand', '20', '50')
        assert with_link > without

    def test_partial_brand_match_lower_than_exact(self):
        exact   = _score('Alpha Beta',   '20', '50', 'Alpha Beta',   '20', '50')
        partial = _score('Alpha Beta',   '20', '50', 'Alpha',        '20', '50')
        assert exact > partial


# ── Discount scoring (max 30) ─────────────────────────────────────────────────
class TestDiscountScoring:
    def test_matching_discount_full_points(self):
        s = _score('Brand', '20', '50', 'Brand', '20', '50')
        assert s == 100

    def test_discount_mismatch_reduces_score(self):
        match    = _score('Brand', '20', '50', 'Brand', '20', '50')
        mismatch = _score('Brand', '20', '50', 'Brand', '15', '50')
        assert match > mismatch
        assert match - mismatch >= 25

    def test_discount_normalization(self):
        """'20%' and '20' should score the same."""
        pct   = _score('Brand', '20%', '50', 'Brand', '20%', '50')
        plain = _score('Brand', '20',  '50', 'Brand', '20',  '50')
        assert pct == plain

    def test_zero_discount_match(self):
        s = _score('Brand', '0', '0', 'Brand', '0', '0')
        assert s == 100


# ── Vendor scoring (max 15) ───────────────────────────────────────────────────
class TestVendorScoring:
    def test_vendor_mismatch_penalty(self):
        match    = _score('Brand', '20', '50', 'Brand', '20', '50')
        mismatch = _score('Brand', '20', '50', 'Brand', '20', '0')
        assert match > mismatch

    def test_both_zero_vendor_scores_full(self):
        s = _score('Brand', '20', '0', 'Brand', '20', '0')
        assert s == 100


# ── Category scoring (max 5) ──────────────────────────────────────────────────
class TestCategoryScoring:
    def test_category_match_adds_points(self):
        with_cat    = _score('Brand', '20', '50', 'Brand', '20', '50', can_cat='Flower')
        without_cat = _score('Brand', '20', '50', 'Brand', '20', '50', can_cat='')
        assert with_cat >= without_cat

    def test_wrong_category_does_not_penalize_below_zero(self):
        s = _score('Brand', '20', '50', 'Brand', '20', '50', can_cat='Edibles')
        assert s >= 0


# ── Score range ───────────────────────────────────────────────────────────────
class TestScoreRange:
    def test_score_always_0_to_100(self):
        cases = [
            ('Alpha', '20', '50', 'Omega', '15', '0'),
            ('',      '0',  '0',  '',      '0',  '0'),
            ('Brand', '20', '50', 'Brand', '20', '50'),
        ]
        for args in cases:
            s = _score(*args)
            assert 0 <= s <= 100, f"score={s} for args={args}"
