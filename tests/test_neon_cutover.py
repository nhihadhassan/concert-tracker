from datetime import datetime
from decimal import Decimal
from uuid import UUID

from scripts.neon_cutover import (
    _normalized_timestamp,
    _to_json_safe,
    canonical_row,
    row_key,
)


def test_row_key_uses_id_by_default():
    assert row_key("concerts", {"id": "concert-1"}) == "concert-1"


def test_row_key_uses_composite_attendee_identity():
    row = {"concert_id": "concert-1", "user_id": "user-1"}
    assert row_key("concert_attendees", row) == "concert-1:user-1"


def test_row_key_uses_user_id_for_tables_without_an_id_column():
    # app_members and spotify_accounts are keyed on user_id, not id -- a real
    # bug caught while running the actual cutover (KeyError: 'id').
    assert row_key("app_members", {"user_id": "member-1"}) == "member-1"
    assert row_key("spotify_accounts", {"user_id": "member-1"}) == "member-1"


def test_normalized_timestamp_matches_regardless_of_fraction_digit_count():
    # Postgres/PostgREST trims trailing zeros (".82362"); Python's own
    # isoformat() always emits 6 digits (".823620"). Both represent the same
    # instant and must normalize identically.
    trimmed = "2026-07-30T21:02:34.82362+00:00"
    full = "2026-07-30T21:02:34.823620+00:00"
    assert _normalized_timestamp(trimmed) == _normalized_timestamp(full)


def test_normalized_timestamp_handles_z_suffix():
    assert _normalized_timestamp("2026-07-30T21:02:34Z") == "2026-07-30T21:02:34+00:00"


def test_normalized_timestamp_none_stays_none():
    assert _normalized_timestamp(None) is None


def test_to_json_safe_normalizes_psycopg_native_types():
    assert _to_json_safe(UUID("11111111-1111-4111-8111-111111111111")) == (
        "11111111-1111-4111-8111-111111111111"
    )
    assert _to_json_safe(Decimal("8.50")) == "8.5"
    assert _to_json_safe(datetime(2026, 1, 1, 12, 0, 0)) == "2026-01-01T12:00:00"
    assert _to_json_safe(None) is None
    assert _to_json_safe("plain string") == "plain string"


def test_to_json_safe_recurses_into_containers():
    value = {"id": UUID("11111111-1111-4111-8111-111111111111"), "tags": [Decimal("1.0")]}
    assert _to_json_safe(value) == {
        "id": "11111111-1111-4111-8111-111111111111",
        "tags": ["1"],
    }


def test_canonical_row_treats_supabase_and_neon_timestamp_shapes_as_equal():
    supabase_row = {"id": "x", "updated_at": "2026-07-30T21:02:34.82362+00:00"}
    neon_row = {"id": "x", "updated_at": datetime.fromisoformat("2026-07-30T21:02:34.823620+00:00")}
    fields = ["id", "updated_at"]
    assert canonical_row(supabase_row, fields) == canonical_row(neon_row, fields)


def test_canonical_row_normalizes_numeric_precision():
    left = canonical_row({"price": 12.50}, ["price"])
    right = canonical_row({"price": Decimal("12.5")}, ["price"])
    assert left == right == {"price": "12.5"}
