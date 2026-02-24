# tests/test_csv_resolver.py — Tests for resolve_mis_csv_for_route priority chain
from __future__ import annotations

import pytest
import pandas as pd
from pathlib import Path
from src.utils.csv_resolver import resolve_mis_csv_for_route


class _MockSession:
    """Minimal session stub for testing resolver fallback chain."""
    def __init__(self, csv_path: str | None = None):
        self._path = csv_path

    def get_mis_csv_filepath(self) -> str:
        return self._path or ''

    def get_mis_df(self):
        return None


class _MockFile:
    """Simulate a werkzeug FileStorage-like object."""
    def __init__(self, df: pd.DataFrame, tmp_path: Path):
        self._path = tmp_path / 'upload.csv'
        df.to_csv(self._path, index=False)

    def read(self) -> bytes:
        return self._path.read_bytes()

    # werkzeug compatibility
    def save(self, path):
        import shutil
        shutil.copy(self._path, path)

    @property
    def filename(self):
        return 'upload.csv'


SAMPLE_DF = pd.DataFrame([{'ID': '111', 'Brand': 'Alpha', 'Daily Deal Discount': 20.0}])


class TestResolveMisCsvForRoute:
    def test_uploaded_file_takes_priority(self, tmp_path):
        mock_file = _MockFile(SAMPLE_DF, tmp_path)
        local_path = tmp_path / 'local.csv'
        SAMPLE_DF.assign(Brand='LocalBrand').to_csv(local_path, index=False)
        session = _MockSession(str(local_path))

        result = resolve_mis_csv_for_route(
            csv_file=mock_file,
            local_path=str(local_path),
            session=session,
        )
        assert result is not None
        assert not result.empty

    def test_local_path_used_when_no_upload(self, tmp_path):
        local_path = tmp_path / 'local.csv'
        SAMPLE_DF.to_csv(local_path, index=False)
        session = _MockSession()

        result = resolve_mis_csv_for_route(
            csv_file=None,
            local_path=str(local_path),
            session=session,
        )
        assert result is not None
        assert not result.empty

    def test_session_path_fallback(self, tmp_path):
        session_path = tmp_path / 'session.csv'
        SAMPLE_DF.to_csv(session_path, index=False)
        session = _MockSession(str(session_path))

        result = resolve_mis_csv_for_route(
            csv_file=None,
            local_path=None,
            session=session,
        )
        assert result is not None
        assert not result.empty

    def test_no_source_returns_none(self):
        session = _MockSession()
        result = resolve_mis_csv_for_route(
            csv_file=None,
            local_path=None,
            session=session,
        )
        assert result is None

    def test_nonexistent_local_path_skipped(self, tmp_path):
        session = _MockSession()
        result = resolve_mis_csv_for_route(
            csv_file=None,
            local_path='/no/such/file.csv',
            session=session,
        )
        assert result is None

    def test_result_is_dataframe(self, tmp_path):
        local_path = tmp_path / 'data.csv'
        SAMPLE_DF.to_csv(local_path, index=False)
        session = _MockSession()

        result = resolve_mis_csv_for_route(
            csv_file=None,
            local_path=str(local_path),
            session=session,
        )
        assert isinstance(result, pd.DataFrame)
