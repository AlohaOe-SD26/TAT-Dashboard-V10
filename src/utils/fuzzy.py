# =============================================================================
# src/utils/fuzzy.py
# Step 3: Pure utility extraction from main_-_bloat.py — zero logic changes.
# compute_match_score() is the canonical scoring implementation per
# ARCHITECTURE_LOGIC.md (Brand 50 / Discount 30 / Vendor 15 / Category 5).
# Contains: compute_match_score, generate_fuzzy_suggestions
# =============================================================================
import re
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd
from src.utils.location_helpers import resolve_to_store_set, normalize_location_string
# Prefer rapidfuzz (faster), fall back to fuzzywuzzy, then provide minimal stub.
try:
    from rapidfuzz import fuzz  # type: ignore
except ImportError:
    try:
        from fuzzywuzzy import fuzz  # type: ignore  # noqa: F401
    except ImportError:
        # Network-unavailable fallback: simple ratio via difflib
        import difflib
        class fuzz:  # type: ignore
            @staticmethod
            def token_set_ratio(a: str, b: str) -> int:
                return int(difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio() * 100)
            @staticmethod
            def partial_ratio(a: str, b: str) -> int:
                return fuzz.token_set_ratio(a, b)
            @staticmethod
            def ratio(a: str, b: str) -> int:
                return fuzz.token_set_ratio(a, b)

def compute_match_score(
    expected: Dict[str, Any],
    candidate: Dict[str, Any],
    brand_settings: Dict[str, str] | None = None,
) -> int:
    """
    Core fuzzy match scoring algorithm — extracted from enhanced_match_mis_ids.

    Scoring weights (documented in ARCHITECTURE_LOGIC.md):
      Brand    : 50 pts  (token_set_ratio; +5 bonus if linked brand match)
      Discount : 30 pts  (token_set_ratio on discount string)
      Vendor % : 15 pts  (exact or near-match on vendor contribution)
      Category : 5  pts  (token_set_ratio on category string)
      ─────────────────
      Max      : 100 pts

    Args:
        expected:       Dict with keys: brand, discount, vendor_pct, category
        candidate:      Dict with same keys from MIS CSV row
        brand_settings: Optional mapped brand names (Settings tab)

    Returns:
        Integer score 0–100.
    """
    score = 0

    # ── Brand (50 pts) ───────────────────────────────────────────────────────
    exp_brand = str(expected.get('brand', '')).lower().strip()
    cand_brand = str(candidate.get('brand', '')).lower().strip()
    if exp_brand and cand_brand:
        brand_ratio = fuzz.token_set_ratio(exp_brand, cand_brand)
        brand_pts = int(brand_ratio * 0.50)

        # +5 bonus: linked brand match via brand_settings
        if brand_settings:
            mapped = brand_settings.get(expected.get('brand', ''), '')
            if mapped and fuzz.token_set_ratio(mapped.lower(), cand_brand) >= 90:
                brand_pts = min(50, brand_pts + 5)

        score += brand_pts

    # ── Discount (30 pts) ────────────────────────────────────────────────────
    exp_disc = str(expected.get('discount', '')).lower().strip()
    cand_disc = str(candidate.get('discount', '')).lower().strip()
    if exp_disc and cand_disc:
        disc_ratio = fuzz.token_set_ratio(exp_disc, cand_disc)
        score += int(disc_ratio * 0.30)

    # ── Vendor % (15 pts) ────────────────────────────────────────────────────
    try:
        exp_v = float(str(expected.get('vendor_pct', 0)).replace('%', '').strip() or 0)
        cand_v = float(str(candidate.get('vendor_pct', 0)).replace('%', '').strip() or 0)
        if exp_v and cand_v:
            diff = abs(exp_v - cand_v)
            if diff == 0:
                score += 15
            elif diff <= 5:
                score += 10
            elif diff <= 10:
                score += 5
    except (ValueError, TypeError):
        pass

    # ── Category (5 pts) ─────────────────────────────────────────────────────
    exp_cat = str(expected.get('category', '')).lower().strip()
    cand_cat = str(candidate.get('category', '')).lower().strip()
    if exp_cat and cand_cat:
        cat_ratio = fuzz.token_set_ratio(exp_cat, cand_cat)
        score += int(cat_ratio * 0.05)

    return min(100, score)


def generate_fuzzy_suggestions(expected_deal: Dict, mis_df: pd.DataFrame, max_results: int = 3) -> List[Dict]:
    """
    Find similar deals in MIS CSV when exact MIS ID is missing.
    Scores by: brand (40pts), discount (20pts), vendor% (10pts), dates (20pts), locations (10pts)
    """
    if mis_df is None or mis_df.empty:
        return []
    
    suggestions = []
    exp_brand = str(expected_deal.get('brand', '')).lower()
    exp_discount = str(expected_deal.get('discount', '')).lower()
    exp_vendor = str(expected_deal.get('vendor_pct', '')).lower()
    exp_locations = str(expected_deal.get('locations', '')).lower()
    
    for _, row in mis_df.iterrows():
        score = 0
        
        # Brand match (40 pts max)
        act_brand = str(row.get('Brand', '')).lower()
        brand_score = fuzz.token_set_ratio(exp_brand, act_brand)
        if brand_score >= 85:
            score += 40
        elif brand_score >= 70:
            score += 25
        elif brand_score >= 50:
            score += 10
        
        # Discount match (20 pts max)
        act_discount = str(row.get('Daily Deal Discount', '')).lower()
        if exp_discount and act_discount and exp_discount == act_discount:
            score += 20
        elif exp_discount and act_discount and fuzz.ratio(exp_discount, act_discount) > 80:
            score += 10
        
        # Vendor % match (10 pts max)
        act_vendor = str(row.get('Discount paid by vendor', '')).lower()
        if exp_vendor and act_vendor and exp_vendor == act_vendor:
            score += 10
        
        # Location match (10 pts max) - v12.26.3: Set-based comparison
        act_loc_str = normalize_location_string(str(row.get('Store', '')))
        exp_loc_set = resolve_to_store_set(exp_locations)
        act_loc_set = resolve_to_store_set(act_loc_str)
        if exp_loc_set == act_loc_set:
            score += 10
        elif exp_loc_set & act_loc_set:  # Partial overlap
            overlap_ratio = len(exp_loc_set & act_loc_set) / max(len(exp_loc_set), len(act_loc_set), 1)
            if overlap_ratio >= 0.8:
                score += 7
            elif overlap_ratio >= 0.5:
                score += 5
        
        # Only include if score is meaningful
        if score >= 30:
            suggestions.append({
                'mis_id': str(row.get('ID', '')),
                'score': score,
                'brand': str(row.get('Brand', '')),
                'discount': str(row.get('Daily Deal Discount', '')),
                'vendor_pct': str(row.get('Discount paid by vendor', '')),
                'locations': normalize_location_string(str(row.get('Store', ''))),
                'start_date': str(row.get('Start date', '')),
                'end_date': str(row.get('End date', '')),
                'weekday': str(row.get('Weekday', ''))
            })
    
    # Sort by score descending and return top results
    suggestions.sort(key=lambda x: x['score'], reverse=True)
    return suggestions[:max_results]


