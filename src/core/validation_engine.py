# src/core/validation_engine.py — v2.0
# ─────────────────────────────────────────────────────────────────────────────
# THE unified ValidationEngine. Mode-agnostic — callers construct the records.
#
# ARCHITECTURE RULE: Do NOT add mode flags to this class.
#   Mode A (Pre-Flight):     source = Google Sheet row, target = Selenium payload
#   Mode B (Compare-to-Sheet): source = Google Sheet row, target = MIS CSV / modal
#
# Severity contract:
#   CRITICAL → RED banner  → blocks save
#   ADVISORY → ORANGE banner → warns only
#
# Field routing:
#   CRITICAL : discount, vendor_pct, brand, locations, start_date, end_date
#   ADVISORY : active_days, categories, rebate_type
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal


# ── Data Structures ──────────────────────────────────────────────────────────

@dataclass
class ValidationRecord:
    """
    Normalized, source-agnostic representation of one deal entry.
    Both the Google Sheet source and the MIS target are expressed in this format
    before being handed to the ValidationEngine.

    Callers are responsible for field normalization (lowercasing, strip, float
    conversion) before constructing this record. The engine compares — it does
    not clean.
    """
    discount:    str           # e.g. "20%" or "20.0"
    vendor_pct:  str           # e.g. "50%" or "50.0"
    brand:       str           # Translated brand name (Settings tab rule already applied)
    locations:   list[str]     # Canonical store name list  e.g. ["Beverly Hills", "Davis"]
    start_date:  str           # ISO format: "2025-01-01"  (empty string = not applicable)
    end_date:    str           # ISO format: "2025-01-31"
    deal_type:   Literal['weekly', 'monthly', 'sale']
    active_days: list[str] = field(default_factory=list)   # e.g. ["Friday", "Sunday"]
    categories:  list[str] = field(default_factory=list)
    rebate_type: str = ''      # e.g. "Wholesale", "Retail", ""
    mis_id:      str = ''
    raw:         dict = field(default_factory=dict, repr=False)  # Original data for debugging


@dataclass
class FieldResult:
    """
    Comparison result for a single field between source and target records.
    List of these is returned by ValidationEngine.compare().
    """
    field:        str
    source_value: Any
    target_value: Any
    status:       Literal['MATCH', 'MISMATCH', 'MISSING', 'WARNING']
    severity:     Literal['CRITICAL', 'ADVISORY']
    message:      str


@dataclass
class ValidationSummary:
    """Aggregate result from ValidationEngine.summary()."""
    overall_status: Literal['PASS', 'WARN', 'FAIL']
    critical_count: int     # Drives RED banner — blocks save
    advisory_count: int     # Drives ORANGE banner — warns only
    details:        list[FieldResult]

    def to_dict(self) -> dict:
        """Serialize to JSON-safe dict for API responses."""
        return {
            'overall_status': self.overall_status,
            'critical_count': self.critical_count,
            'advisory_count': self.advisory_count,
            'details': [
                {
                    'field':        r.field,
                    'source_value': r.source_value,
                    'target_value': r.target_value,
                    'status':       r.status,
                    'severity':     r.severity,
                    'message':      r.message,
                }
                for r in self.details
            ],
        }


# ── Engine ───────────────────────────────────────────────────────────────────

class ValidationEngine:
    """
    Mode-agnostic field-by-field diff engine.

    Mode A (Pre-Flight):
        source = ValidationRecord built from Google Sheet row
        target = ValidationRecord built from Selenium automation payload

    Mode B (Compare-to-Sheet):
        source = ValidationRecord built from Google Sheet row
        target = ValidationRecord built from MIS CSV row or browser-scraped modal

    The engine is unaware of which mode is active. It receives two records and
    produces a list of FieldResults. The caller decides what to do with them.
    """

    # Fields that drive the RED banner and block save
    CRITICAL_FIELDS: frozenset[str] = frozenset({
        'discount', 'vendor_pct', 'brand', 'locations', 'start_date', 'end_date'
    })

    # Fields that drive the ORANGE banner (warn, do not block)
    ADVISORY_FIELDS: frozenset[str] = frozenset({
        'active_days', 'categories', 'rebate_type'
    })

    # Numeric tolerance for discount / vendor_pct float comparison
    # Sourced from compare_deal_attributes() in monolith (tolerance=0.5)
    NUMERIC_TOLERANCE: float = 0.5

    # ── Public Interface ─────────────────────────────────────────────────────

    def compare(
        self,
        source: ValidationRecord,
        target: ValidationRecord,
    ) -> list[FieldResult]:
        """
        Run full field-by-field comparison between source and target records.

        Returns an ordered list of FieldResult objects — one per compared field.
        MATCH results ARE included so callers can render green checkmarks
        alongside red/orange flags.

        Field order: discount, vendor_pct, brand, locations, start_date,
                     end_date, active_days, categories, rebate_type
        """
        results: list[FieldResult] = []

        # ── CRITICAL fields ──────────────────────────────────────────────────

        results.append(self._compare_numeric(
            'discount', source.discount, target.discount, 'CRITICAL'
        ))

        results.append(self._compare_numeric(
            'vendor_pct', source.vendor_pct, target.vendor_pct, 'CRITICAL'
        ))

        results.append(self._compare_scalar(
            'brand', source.brand, target.brand, 'CRITICAL'
        ))

        results.append(self._compare_list_as_set(
            'locations', source.locations, target.locations, 'CRITICAL'
        ))

        # Dates: only compare when source has a value
        # (Pre-flight mode may have dates; Compare-to-Sheet mode always does)
        if source.start_date:
            results.append(self._compare_date(
                'start_date', source.start_date, target.start_date, 'CRITICAL'
            ))

        if source.end_date:
            results.append(self._compare_date(
                'end_date', source.end_date, target.end_date, 'CRITICAL'
            ))

        # ── ADVISORY fields ──────────────────────────────────────────────────

        if source.active_days:
            results.append(self._compare_list_as_set(
                'active_days', source.active_days, target.active_days, 'ADVISORY'
            ))

        if source.categories:
            results.append(self._compare_list_as_set(
                'categories', source.categories, target.categories, 'ADVISORY'
            ))

        if source.rebate_type:
            results.append(self._compare_scalar(
                'rebate_type', source.rebate_type, target.rebate_type, 'ADVISORY'
            ))

        return results

    def summary(self, results: list[FieldResult]) -> ValidationSummary:
        """
        Aggregate a list of FieldResults into a ValidationSummary.

        overall_status logic (from monolith banner rules):
          FAIL  → any CRITICAL MISMATCH or CRITICAL MISSING
          WARN  → any ADVISORY WARNING/MISMATCH, no CRITICAL issues
          PASS  → all fields MATCH or only ADVISORY MATCHes
        """
        critical_issues = [
            r for r in results
            if r.severity == 'CRITICAL' and r.status in ('MISMATCH', 'MISSING')
        ]
        advisory_issues = [
            r for r in results
            if r.severity == 'ADVISORY' and r.status in ('MISMATCH', 'WARNING', 'MISSING')
        ]

        if critical_issues:
            overall = 'FAIL'
        elif advisory_issues:
            overall = 'WARN'
        else:
            overall = 'PASS'

        return ValidationSummary(
            overall_status=overall,
            critical_count=len(critical_issues),
            advisory_count=len(advisory_issues),
            details=results,
        )

    # ── Private comparison helpers ───────────────────────────────────────────

    def _compare_scalar(
        self,
        field_name: str,
        source: Any,
        target: Any,
        severity: Literal['CRITICAL', 'ADVISORY'],
    ) -> FieldResult:
        """
        Compare two scalar values (strings, booleans).
        Comparison is case-insensitive after strip().
        An empty/missing target triggers MISSING status.
        """
        src_norm = str(source).strip().lower() if source is not None else ''
        tgt_norm = str(target).strip().lower() if target is not None else ''

        if not tgt_norm or tgt_norm in ('none', 'nan', 'n/a', '-', ''):
            return FieldResult(
                field=field_name,
                source_value=source,
                target_value=target,
                status='MISSING',
                severity=severity,
                message=f"{field_name}: target value is empty (expected '{source}')",
            )

        if src_norm == tgt_norm:
            return FieldResult(
                field=field_name,
                source_value=source,
                target_value=target,
                status='MATCH',
                severity=severity,
                message=f"{field_name}: ✓ match ('{source}')",
            )

        return FieldResult(
            field=field_name,
            source_value=source,
            target_value=target,
            status='MISMATCH',
            severity=severity,
            message=f"{field_name}: expected '{source}', got '{target}'",
        )

    def _compare_list_as_set(
        self,
        field_name: str,
        source: list,
        target: list,
        severity: Literal['CRITICAL', 'ADVISORY'],
    ) -> FieldResult:
        """
        Compare two lists as unordered sets (order-independent).
        Normalizes each element: lower().strip().
        Empty target list → MISSING.
        Partial overlap → MISMATCH with added/removed detail.
        """
        # Normalize to lowercase sets, filter blanks
        src_set = {str(s).strip().lower() for s in (source or []) if str(s).strip()}
        tgt_set = {str(t).strip().lower() for t in (target or []) if str(t).strip()}

        # All-stores sentinel — empty list = "all locations" in MIS context
        # Preserve original lists for display
        src_display = source or []
        tgt_display = target or []

        if not tgt_set:
            return FieldResult(
                field=field_name,
                source_value=src_display,
                target_value=tgt_display,
                status='MISSING',
                severity=severity,
                message=f"{field_name}: target list is empty (expected {src_display})",
            )

        if src_set == tgt_set:
            return FieldResult(
                field=field_name,
                source_value=src_display,
                target_value=tgt_display,
                status='MATCH',
                severity=severity,
                message=f"{field_name}: ✓ match ({src_display})",
            )

        added   = sorted(tgt_set - src_set)
        removed = sorted(src_set - tgt_set)
        parts = []
        if removed:
            parts.append(f"missing: {removed}")
        if added:
            parts.append(f"extra: {added}")

        return FieldResult(
            field=field_name,
            source_value=src_display,
            target_value=tgt_display,
            status='MISMATCH',
            severity=severity,
            message=f"{field_name}: {'; '.join(parts)}",
        )

    def _compare_numeric(
        self,
        field_name: str,
        source: str,
        target: str,
        severity: Literal['CRITICAL', 'ADVISORY'],
        tolerance: float | None = None,
    ) -> FieldResult:
        """
        Parse both values to float and compare within tolerance.
        Handles '%' suffix, '$' prefix, 'off' suffix, empty strings, and
        decimal percentages (0.50 → 50.0 when no % sign present).

        Tolerance defaults to NUMERIC_TOLERANCE (0.5) — from monolith
        compare_deal_attributes(tolerance=0.5).
        """
        tol = tolerance if tolerance is not None else self.NUMERIC_TOLERANCE

        src_f = self._parse_numeric(source)
        tgt_f = self._parse_numeric(target)

        # If target is unparseable / empty → MISSING
        if tgt_f is None:
            return FieldResult(
                field=field_name,
                source_value=source,
                target_value=target,
                status='MISSING',
                severity=severity,
                message=f"{field_name}: target value is empty or unparseable (expected '{source}')",
            )

        # If source is unparseable, fall back to string comparison
        if src_f is None:
            return self._compare_scalar(field_name, source, target, severity)

        if abs(src_f - tgt_f) <= tol:
            return FieldResult(
                field=field_name,
                source_value=source,
                target_value=target,
                status='MATCH',
                severity=severity,
                message=f"{field_name}: ✓ match ({src_f} ≈ {tgt_f})",
            )

        return FieldResult(
            field=field_name,
            source_value=source,
            target_value=target,
            status='MISMATCH',
            severity=severity,
            message=f"{field_name}: expected '{source}' ({src_f}), got '{target}' ({tgt_f})",
        )

    def _compare_date(
        self,
        field_name: str,
        source: str,
        target: str,
        severity: Literal['CRITICAL', 'ADVISORY'],
    ) -> FieldResult:
        """
        Compare ISO date strings (YYYY-MM-DD).
        Falls back to exact string comparison if parsing fails.
        Empty target → MISSING.
        """
        src_norm = str(source).strip()
        tgt_norm = str(target).strip()

        if not tgt_norm or tgt_norm in ('none', 'nan', '', '-'):
            return FieldResult(
                field=field_name,
                source_value=source,
                target_value=target,
                status='MISSING',
                severity=severity,
                message=f"{field_name}: target date is empty (expected '{source}')",
            )

        # Normalize: accept MM/DD/YYYY and convert to YYYY-MM-DD for comparison
        src_norm = self._normalize_date(src_norm)
        tgt_norm = self._normalize_date(tgt_norm)

        if src_norm == tgt_norm:
            return FieldResult(
                field=field_name,
                source_value=source,
                target_value=target,
                status='MATCH',
                severity=severity,
                message=f"{field_name}: ✓ match ('{source}')",
            )

        return FieldResult(
            field=field_name,
            source_value=source,
            target_value=target,
            status='MISMATCH',
            severity=severity,
            message=f"{field_name}: expected '{source}', got '{target}'",
        )

    # ── Static helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _parse_numeric(val: Any) -> float | None:
        """
        Parse a value to float, handling common formatting.
        Returns None if the value is empty or non-numeric.

        Handles:
          '50%'     → 50.0
          '50% off' → 50.0
          '$20'     → 20.0
          '0.50'    → 50.0  (decimal % heuristic: 0 < x < 1 with no % sign → ×100)
          '50'      → 50.0
          ''        → None
          'nan'     → None
        """
        if val is None:
            return None
        val_str = str(val).strip().lower()
        if not val_str or val_str in ('', '-', 'nan', 'none', 'n/a'):
            return None

        had_percent = '%' in val_str

        # Strip non-numeric characters (keep digits, '.', '-')
        val_str = val_str.replace('off', '').replace('discount', '').strip()
        cleaned = ''
        found_decimal = False
        for c in val_str:
            if c.isdigit():
                cleaned += c
            elif c == '.' and not found_decimal:
                cleaned += c
                found_decimal = True
            elif c == '-' and cleaned == '':
                cleaned += c

        if not cleaned or cleaned == '-':
            return None

        try:
            num = float(cleaned)
            # Decimal % heuristic: 0.50 without % sign → 50.0
            if 0 < num < 1 and not had_percent:
                num = num * 100
            return num
        except ValueError:
            return None

    @staticmethod
    def _normalize_date(val: str) -> str:
        """
        Normalize date strings to YYYY-MM-DD for comparison.
        Accepts: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY.
        Returns the original string unchanged if format is unrecognized.
        """
        # Already ISO
        if re.match(r'^\d{4}-\d{2}-\d{2}$', val):
            return val
        # MM/DD/YYYY
        m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', val)
        if m:
            month, day, year = m.group(1), m.group(2), m.group(3)
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return val


# ── Module-level singleton ────────────────────────────────────────────────────
# Import this instance in route files rather than instantiating directly.
engine = ValidationEngine()
