from datetime import datetime, timedelta, timezone

from scripts.stage9_monitor import (
    CLEANUP_EARLIEST,
    backup_age,
    cleanup_status,
    parse_database_size,
)


def test_parse_database_size():
    output = "postgres | 16 MB | 1944 kB | 1448 kB"
    assert parse_database_size(output) == 16 * 1024 * 1024
    assert parse_database_size('{"rows":[{"database_size":"16 MB"}]}') == 16 * 1024 * 1024


def test_backup_age_handles_timezone():
    now = datetime(2026, 7, 3, 18, tzinfo=timezone.utc)
    state = {"last_success_at": "2026-07-03T17:30:00+00:00"}
    assert backup_age(state, now) == timedelta(minutes=30)


def test_cleanup_gate_cannot_pass_before_thirty_days():
    status = cleanup_status(CLEANUP_EARLIEST - timedelta(seconds=1))
    assert status["date_gate_passed"] is False
    assert status["cleanup_allowed"] is False
    assert status["days_remaining"] == 1


def test_cleanup_still_requires_explicit_approval_after_date_gate():
    status = cleanup_status(CLEANUP_EARLIEST + timedelta(days=1))
    assert status["date_gate_passed"] is True
    assert status["cleanup_allowed"] is False
    assert status["days_remaining"] == 0
