import httpx
import pytest

from scripts.stage8_cutover import (
    canonical_row,
    compare_destination,
    fetch_active_destination,
    row_key,
    validate_context,
)


def source_state():
    return {
        "concerts": [
            {
                "id": "concert-1",
                "artist": "Artist",
                "price": 12.5,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ],
        "concert_attendees": [{"concert_id": "concert-1", "user_id": "user-1", "row_version": 1}],
        "concert_reviews": [
            {
                "id": "review-1",
                "concert_id": "concert-1",
                "rating_override": 8.0,
            }
        ],
    }


def test_row_key_uses_composite_attendee_identity():
    row = {"concert_id": "concert-1", "user_id": "user-1"}
    assert row_key("concert_attendees", row) == "concert-1:user-1"


def test_canonical_row_normalizes_postgrest_numbers_and_timestamps():
    left = canonical_row(
        {"price": 12.5, "created_at": "2026-01-01T00:00:00Z"},
        ("price", "created_at"),
    )
    right = canonical_row(
        {"price": "12.50", "created_at": "2025-12-31T19:00:00-05:00"},
        ("price", "created_at"),
    )
    assert left == right


def test_canonical_row_accepts_variable_fractional_seconds_on_python_39():
    row = canonical_row(
        {"updated_at": "2026-06-29T16:26:41.27+00:00"},
        ("updated_at",),
    )
    assert row["updated_at"] == "2026-06-29T16:26:41.270000+00:00"


def test_compare_destination_reports_only_missing_rows():
    normalized = source_state()
    report = compare_destination(
        normalized,
        {"concerts": [], "concert_attendees": [], "concert_reviews": []},
    )
    assert report["concerts"]["missing"] == ["concert-1"]
    assert report["concert_attendees"]["missing"] == ["concert-1:user-1"]
    assert report["concert_reviews"]["missing"] == ["review-1"]
    assert report["conflicts"] == []


def test_compare_destination_accepts_database_representation():
    normalized = source_state()
    destination = {
        "concerts": [
            {
                **normalized["concerts"][0],
                "price": "12.50",
                "created_at": "2025-12-31T19:00:00-05:00",
                "last_mutation_id": None,
            }
        ],
        "concert_attendees": normalized["concert_attendees"],
        "concert_reviews": [{**normalized["concert_reviews"][0], "rating_override": "8.00"}],
    }
    report = compare_destination(normalized, destination)
    assert report["conflicts"] == []
    assert all(not report[table]["missing"] for table in normalized)


def test_compare_destination_surfaces_changed_fields_and_extra_rows():
    normalized = source_state()
    destination = {
        "concerts": [{**normalized["concerts"][0], "artist": "Changed"}],
        "concert_attendees": normalized["concert_attendees"],
        "concert_reviews": [
            normalized["concert_reviews"][0],
            {"id": "review-extra", "concert_id": "concert-1"},
        ],
    }
    report = compare_destination(normalized, destination)
    assert report["conflicts"] == [{"table": "concerts", "key": "concert-1", "fields": ["artist"]}]
    assert report["concert_reviews"]["extra"] == ["review-extra"]


def test_validate_context_accepts_matching_live_rule_uuid():
    normalized = {
        "concert_attendees": [{"user_id": "user-1"}, {"user_id": "user-2"}],
        "concert_reviews": [{"rating_rule_version_id": "live-rule"}],
    }
    members = [
        {"user_id": "user-1", "is_active": True},
        {"user_id": "user-2", "is_active": True},
    ]
    rules = [
        {
            "id": "live-rule",
            "version": 1,
            "enjoyment_weight": "0.5000000",
            "stage_weight": "0.1666667",
            "setlist_weight": "0.1666667",
            "seat_weight": "0.1666666",
            "rounds_to": 1,
            "maximum_rating": "10.00",
            "renormalize_missing": True,
            "retired_at": None,
            "deleted_at": None,
        }
    ]
    validate_context(normalized, members, rules)


def test_validate_context_rejects_changed_rule_semantics():
    normalized = {
        "concert_attendees": [{"user_id": "user-1"}],
        "concert_reviews": [{"rating_rule_version_id": "live-rule"}],
    }
    members = [{"user_id": "user-1", "is_active": True}]
    rules = [
        {
            "id": "live-rule",
            "version": 1,
            "enjoyment_weight": "0.25",
            "stage_weight": "0.25",
            "setlist_weight": "0.25",
            "seat_weight": "0.25",
            "rounds_to": 1,
            "maximum_rating": "10",
            "renormalize_missing": True,
            "retired_at": None,
            "deleted_at": None,
        }
    ]
    with pytest.raises(SystemExit, match="approved Stage 3 formula"):
        validate_context(normalized, members, rules)


def test_fetch_active_destination_excludes_children_of_deleted_concert(monkeypatch):
    rows = {
        "concerts": [
            {"id": "active", "deleted_at": None},
            {"id": "deleted", "deleted_at": "2026-07-01T00:00:00Z"},
        ],
        "concert_attendees": [
            {"concert_id": "active", "deleted_at": None},
            {"concert_id": "deleted", "deleted_at": None},
        ],
        "concert_reviews": [
            {"concert_id": "active", "deleted_at": None},
            {"concert_id": "deleted", "deleted_at": None},
        ],
    }

    def fake_fetch(_client, _url, _key, table):
        return rows[table]

    monkeypatch.setattr("scripts.stage8_cutover.fetch_table", fake_fetch)
    with httpx.Client() as client:
        destination = fetch_active_destination(client, "https://example.test", "secret")
    assert [row["id"] for row in destination["concerts"]] == ["active"]
    assert [row["concert_id"] for row in destination["concert_attendees"]] == ["active"]
    assert [row["concert_id"] for row in destination["concert_reviews"]] == ["active"]
