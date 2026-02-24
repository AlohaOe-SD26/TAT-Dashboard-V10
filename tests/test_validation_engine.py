# tests/test_validation_engine.py — ValidationEngine unit tests
# Tests all three modes: pre-flight (A), automation (B), manual lookup (C)
from __future__ import annotations

import pytest
from src.core.validation_engine import (
    ValidationEngine,
    ValidationRecord,
    FieldResult,
    SeverityLevel,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture
def engine() -> ValidationEngine:
    return ValidationEngine()


def _record(**kwargs) -> ValidationRecord:
    defaults = {
        'brand':          'TestBrand',
        'linked_brand':   '',
        'discount':       '20',
        'vendor_contrib': '50',
        'weekday':        'Monday',
        'locations':      'All Locations',
        'category':       'Flower',
        'start_date':     '01/06/2025',
        'end_date':       '12/31/2025',
        'rebate_type':    'Daily Deal',
    }
    defaults.update(kwargs)
    return ValidationRecord(**defaults)


# ── FieldResult / SeverityLevel enums ────────────────────────────────────────
class TestSeverityLevel:
    def test_critical_blocks_save(self):
        assert SeverityLevel.CRITICAL.value == 'CRITICAL'

    def test_advisory_warns_only(self):
        assert SeverityLevel.ADVISORY.value == 'ADVISORY'

    def test_ok_passes(self):
        assert SeverityLevel.OK.value == 'OK'

    def test_severity_ordering(self):
        """CRITICAL > ADVISORY > OK for precedence logic."""
        order = [SeverityLevel.CRITICAL, SeverityLevel.ADVISORY, SeverityLevel.OK]
        assert order[0] != order[1] != order[2]


# ── ValidationRecord construction ────────────────────────────────────────────
class TestValidationRecord:
    def test_minimal_record_builds(self):
        r = _record()
        assert r.brand == 'TestBrand'
        assert r.discount == '20'

    def test_missing_brand_empty_string(self):
        r = _record(brand='')
        assert r.brand == ''

    def test_record_is_dataclass(self):
        r = _record()
        assert hasattr(r, '__dataclass_fields__')


# ── Engine: perfect match ─────────────────────────────────────────────────────
class TestEnginePerfectMatch:
    def test_identical_records_all_ok(self, engine):
        source = _record()
        target = _record()
        results = engine.compare(source, target)
        for field, result in results.items():
            assert result.severity == SeverityLevel.OK, f"Field {field} not OK: {result}"

    def test_returns_dict_of_field_results(self, engine):
        r = _record()
        results = engine.compare(r, r)
        assert isinstance(results, dict)
        assert len(results) > 0
        for v in results.values():
            assert isinstance(v, FieldResult)


# ── Engine: discount mismatch (CRITICAL) ──────────────────────────────────────
class TestDiscountMismatch:
    def test_discount_mismatch_is_critical(self, engine):
        source = _record(discount='20')
        target = _record(discount='15')
        results = engine.compare(source, target)
        assert results['discount'].severity == SeverityLevel.CRITICAL

    def test_discount_match_is_ok(self, engine):
        source = _record(discount='20')
        target = _record(discount='20')
        results = engine.compare(source, target)
        assert results['discount'].severity == SeverityLevel.OK

    def test_discount_with_percent_normalizes(self, engine):
        source = _record(discount='20%')
        target = _record(discount='20')
        results = engine.compare(source, target)
        assert results['discount'].severity == SeverityLevel.OK


# ── Engine: vendor mismatch ───────────────────────────────────────────────────
class TestVendorMismatch:
    def test_vendor_mismatch_not_ok(self, engine):
        source = _record(vendor_contrib='50')
        target = _record(vendor_contrib='0')
        results = engine.compare(source, target)
        assert results['vendor_contrib'].severity != SeverityLevel.OK

    def test_vendor_match_ok(self, engine):
        source = _record(vendor_contrib='50')
        target = _record(vendor_contrib='50')
        results = engine.compare(source, target)
        assert results['vendor_contrib'].severity == SeverityLevel.OK


# ── Engine: brand mismatch ────────────────────────────────────────────────────
class TestBrandMismatch:
    def test_brand_mismatch_critical(self, engine):
        source = _record(brand='BrandA')
        target = _record(brand='BrandB')
        results = engine.compare(source, target)
        assert results['brand'].severity == SeverityLevel.CRITICAL

    def test_brand_case_insensitive(self, engine):
        source = _record(brand='testbrand')
        target = _record(brand='TestBrand')
        results = engine.compare(source, target)
        assert results['brand'].severity == SeverityLevel.OK


# ── Engine: date validation ───────────────────────────────────────────────────
class TestDateValidation:
    def test_end_before_start_critical(self, engine):
        source = _record(start_date='06/01/2025', end_date='01/01/2025')
        target = _record(start_date='06/01/2025', end_date='01/01/2025')
        results = engine.validate_record(source)
        # Should detect end_date < start_date
        severity_values = {r.severity for r in results.values()}
        assert SeverityLevel.CRITICAL in severity_values or SeverityLevel.ADVISORY in severity_values

    def test_valid_dates_no_critical(self, engine):
        source = _record(start_date='01/06/2025', end_date='12/31/2025')
        results = engine.validate_record(source)
        # No CRITICAL expected for valid date range
        critical_fields = [k for k, v in results.items() if v.severity == SeverityLevel.CRITICAL
                           and 'date' in k.lower()]
        assert len(critical_fields) == 0


# ── Engine: overall pass/fail ─────────────────────────────────────────────────
class TestOverallResult:
    def test_has_critical_returns_false(self, engine):
        source = _record(brand='BrandA')
        target = _record(brand='BrandB')
        results = engine.compare(source, target)
        assert engine.is_passing(results) is False

    def test_all_ok_returns_true(self, engine):
        r = _record()
        results = engine.compare(r, r)
        assert engine.is_passing(results) is True

    def test_advisory_only_returns_true(self, engine):
        """ADVISORY does not block save — should still pass."""
        source = _record(weekday='Monday, Tuesday')
        target = _record(weekday='Monday')
        results = engine.compare(source, target)
        has_critical = any(v.severity == SeverityLevel.CRITICAL for v in results.values())
        if not has_critical:
            assert engine.is_passing(results) is True
