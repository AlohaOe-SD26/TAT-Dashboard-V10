# src/api/mis_updown.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# Up-Down Planning tab routes. Thin handlers — logic in src/core/updown_planner.py.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import traceback

import pandas as pd
from flask import Blueprint, jsonify, request

from src.session import session
from src.integrations.google_sheets import fetch_google_sheet_data, parse_tab_month_year
from src.utils.csv_resolver import resolve_mis_csv_for_route as resolve_mis_csv
from src.utils.fuzzy import generate_fuzzy_suggestions
from src.core.updown_planner import (
    build_split_plan,
    verify_gap_closure,
    build_final_entry_payload,
    verify_final_entry,
)

bp = Blueprint('mis_updown', __name__)


@bp.route('/api/mis/split-audit/planning', methods=['POST'])
def planning():
    """Phase 1: Read Google Sheet, calculate the 4-step slicing plan."""
    try:
        data     = request.get_json() or {}
        tab_name = data.get('tab', '')

        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        target_month, target_year = parse_tab_month_year(tab_name)
        print(f"[SPLIT AUDIT] Planning for {tab_name} → {target_month}/{target_year}")

        sections_data = fetch_google_sheet_data(tab_name)
        if all(df.empty for df in sections_data.values()):
            return jsonify({'success': False, 'error': 'No data found in sheet'})

        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        plan = build_split_plan(sections_data, target_month, target_year, bmap, pmap)

        # Persist for Phase 2
        session.set('split_plan', json.dumps({
            **{k: v for k, v in plan.items() if k not in ('weekly_deals', 'tier1_deals')},
            'target_month': target_month,
            'target_year':  target_year,
        }, default=str))

        return jsonify({
            'success':          True,
            'date_context':     plan['date_context'],
            'splits_required':  plan['splits_required'],
            'no_conflict':      plan['no_conflict'],
            'weekly_count':     len(plan['weekly_deals']),
            'tier1_count':      len(plan['tier1_deals']),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/mis/split-audit/gap-check', methods=['POST'])
def gap_check():
    """Phase 2: Verify that manually entered MIS splits have closed all timeline gaps."""
    try:
        tab_name = request.form.get('tab')
        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        mis_df = resolve_mis_csv(
            csv_file_obj=request.files.get('csv') if request.files else None,
            local_path=request.form.get('local_csv_path'),
            session=session,
        )
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'MIS CSV data missing'})

        target_month, target_year = parse_tab_month_year(tab_name)
        sections_data = fetch_google_sheet_data(tab_name)
        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        plan = build_split_plan(sections_data, target_month, target_year, bmap, pmap)
        plan['target_year']  = target_year
        plan['target_month'] = target_month

        gap_result = verify_gap_closure(plan, mis_df)

        return jsonify({
            'success':        True,
            'date_context':   plan['date_context'],
            'summary': {
                'weekly_checked':  len(plan.get('weekly_deals', [])),
                'tier1_conflicts': len(plan.get('splits_required', [])),
            },
            **gap_result,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/mis/split-audit/final', methods=['POST'])
def final():
    """Phase 3: Final Audit — ensures exactly 1 dominant deal on each conflict date."""
    try:
        tab_name = request.form.get('tab')
        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        mis_df = resolve_mis_csv(
            csv_file_obj=request.files.get('csv') if request.files else None,
            local_path=request.form.get('local_csv_path'),
            session=session,
        )
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'MIS CSV data missing'})

        from rapidfuzz import fuzz
        import pandas as pd
        from datetime import datetime
        from src.core.updown_planner import _check_mis_weekday_active

        target_month, target_year = parse_tab_month_year(tab_name)
        sections_data = fetch_google_sheet_data(tab_name)
        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        plan = build_split_plan(sections_data, target_month, target_year, bmap, pmap)

        # Build Tier 1 date map from plan
        tier1_map: dict = {}
        for deal in plan.get('tier1_deals', []):
            for d in deal.get('expanded_dates', []):
                if d not in tier1_map:
                    tier1_map[d] = []
                tier1_map[d].append(deal)

        mis_df = mis_df.copy()
        mis_df['Start_DT'] = pd.to_datetime(mis_df['Start date'], errors='coerce')
        mis_df['End_DT']   = pd.to_datetime(mis_df['End date'],   errors='coerce')

        double_dips: list[dict] = []
        empty_gaps:  list[dict] = []
        valid_dates: list[dict] = []

        for check_date, expected_deals in tier1_map.items():
            ts_check = pd.Timestamp(check_date)
            for expected in expected_deals:
                brand = expected['brand']
                potential = mis_df[
                    (mis_df['Brand'].astype(str).apply(lambda x: fuzz.token_set_ratio(x.lower(), brand.lower()) > 85)) &
                    (mis_df['Start_DT'] <= ts_check) &
                    (mis_df['End_DT']   >= ts_check)
                ]
                active = [
                    r for _, r in potential.iterrows()
                    if _check_mis_weekday_active(check_date, str(r.get('Weekday', '')))
                ]

                date_str = check_date.strftime('%Y-%m-%d') if hasattr(check_date, 'strftime') else str(check_date)

                if len(active) == 0:
                    empty_gaps.append({'date': date_str, 'brand': brand, 'expected_source': expected.get('section', '').title()})
                elif len(active) > 1:
                    double_dips.append({
                        'date': date_str, 'brand': brand,
                        'deals': [{'mis_id': str(r.get('ID', '')), 'discount': str(r.get('Daily Deal Discount', ''))} for r in active],
                    })
                else:
                    r = active[0]
                    valid_dates.append({'date': date_str, 'brand': brand, 'mis_id': str(r.get('ID', ''))})

        try:
            date_context = datetime(target_year, target_month, 1).strftime('%B %Y')
        except Exception:
            date_context = f"{target_month}/{target_year}"

        return jsonify({
            'success':      True,
            'date_context': date_context,
            'summary':      {'conflict_dates_checked': len(tier1_map)},
            'double_dips':  double_dips,
            'empty_gaps':   empty_gaps,
            'valid_dates':  valid_dates,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/mis/split-audit/final-check', methods=['POST'])
def final_check():
    """Phase 4: Human-in-the-Loop. Verifies saved MIS data matches the plan."""
    try:
        tab_name = request.form.get('tab')
        if not tab_name:
            return jsonify({'success': False, 'error': 'No tab specified'})

        mis_df = resolve_mis_csv(
            csv_file_obj=request.files.get('csv') if request.files else None,
            local_path=request.form.get('local_csv_path'),
            session=session,
        )
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No MIS CSV available. Pull or upload CSV first.'})

        session.set_mis_df(mis_df)

        target_month, target_year = parse_tab_month_year(tab_name)
        sections_data = fetch_google_sheet_data(tab_name)
        bmap = session.get_mis_bracket_map()
        pmap = session.get_mis_prefix_map()

        plan = build_split_plan(sections_data, target_month, target_year, bmap, pmap)

        verification_results: list[dict] = []
        for split in plan.get('splits_required', []):
            for action_row in split.get('plan', []):
                if action_row.get('action') in ('CREATE_PART1', 'CREATE_PART2', 'PATCH'):
                    payload = build_final_entry_payload({**split, **action_row})
                    result  = verify_final_entry(payload, mis_df)
                    verification_results.append({
                        'brand':   split.get('brand'),
                        'action':  action_row.get('action'),
                        'dates':   action_row.get('dates', ''),
                        **result,
                    })

        try:
            date_context = __import__('datetime').datetime(target_year, target_month, 1).strftime('%B %Y')
        except Exception:
            date_context = f"{target_month}/{target_year}"

        verified_count   = sum(1 for r in verification_results if r.get('verified'))
        unverified_count = len(verification_results) - verified_count

        return jsonify({
            'success':         True,
            'date_context':    date_context,
            'results':         verification_results,
            'verified_count':  verified_count,
            'unverified_count': unverified_count,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/mis/split-audit/fuzzy-suggestions', methods=['POST'])
def fuzzy_suggestions():
    """Lightweight helper: find existing MIS IDs when strict name match fails."""
    try:
        data     = request.get_json() or {}
        expected = data.get('expected', {})

        mis_df = session.get_mis_df()
        if mis_df is None or mis_df.empty:
            return jsonify({'success': False, 'error': 'No MIS CSV loaded'})

        suggestions = generate_fuzzy_suggestions(expected, mis_df, max_results=5)
        return jsonify({'success': True, 'suggestions': suggestions})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
