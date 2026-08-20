"""Unit tests for the PostgREST-filter -> SQL translation in backend/neon_rest.py.

These test the pure translation helpers directly, without a live database
connection -- matching the existing suite's style of exercising logic through
dependency overrides / pure functions rather than a real backend.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import psycopg
import pytest

from backend.neon_rest import (
    NeonRestClient,
    _adapt_value,
    _json_safe,
    _json_safe_row,
    _order_clause,
    _select_columns,
    _split_filters,
    _where_clause,
)


def test_split_filters_separates_reserved_keys_from_row_filters():
    parts = _split_filters(
        {
            "select": "id,artist",
            "order": "concert_date.desc",
            "limit": 5,
            "deleted_at": "is.null",
            "id": "eq.abc-123",
        }
    )
    assert parts["select"] == "id,artist"
    assert parts["order"] == "concert_date.desc"
    assert parts["limit"] == 5
    assert parts["filters"] == {"deleted_at": "is.null", "id": "eq.abc-123"}


def test_split_filters_defaults_reserved_keys_to_none():
    parts = _split_filters({"id": "eq.abc"})
    assert parts["select"] is None
    assert parts["order"] is None
    assert parts["limit"] is None
    assert parts["on_conflict"] is None


def test_where_clause_translates_eq():
    sql, values = _where_clause({"id": "eq.abc-123"})
    assert sql == ' WHERE "id" = %s'
    assert values == ["abc-123"]


def test_where_clause_translates_is_null():
    sql, values = _where_clause({"deleted_at": "is.null"})
    assert sql == ' WHERE "deleted_at" IS NULL'
    assert values == []


def test_where_clause_translates_is_not_null():
    sql, values = _where_clause({"deleted_at": "is.not.null"})
    assert sql == ' WHERE "deleted_at" IS NOT NULL'
    assert values == []


def test_where_clause_combines_multiple_filters_with_and():
    sql, values = _where_clause({"id": "eq.abc", "deleted_at": "is.null"})
    assert sql == ' WHERE "id" = %s AND "deleted_at" IS NULL'
    assert values == ["abc"]


def test_where_clause_empty_filters_produces_no_clause():
    sql, values = _where_clause({})
    assert sql == ""
    assert values == []


def test_where_clause_rejects_unsupported_filter_forms():
    with pytest.raises(ValueError, match="Unsupported PostgREST filter"):
        _where_clause({"id": "in.(1,2,3)"})


def test_order_clause_single_column():
    assert _order_clause("display_name.asc") == ' ORDER BY "display_name" ASC'


def test_order_clause_multi_column():
    assert (
        _order_clause("concert_date.desc,created_at.desc")
        == ' ORDER BY "concert_date" DESC, "created_at" DESC'
    )


def test_order_clause_defaults_to_asc_when_direction_omitted():
    assert _order_clause("artist") == ' ORDER BY "artist" ASC'


def test_order_clause_none_is_empty():
    assert _order_clause(None) == ""


def test_select_columns_star():
    assert _select_columns("*") == "*"
    assert _select_columns(None) == "*"


def test_select_columns_explicit_list():
    assert _select_columns("id,artist,venue") == '"id", "artist", "venue"'


def test_column_identifiers_are_quoted_and_validated():
    with pytest.raises(ValueError, match="Unexpected column"):
        _where_clause({"id; drop table concerts;--": "eq.x"})


def test_created_defaults_only_applied_to_audited_tables():
    client = NeonRestClient.__new__(NeonRestClient)
    client._actor_id = "fd9dadab-baff-4dc0-9fe9-f73b3056bb91"

    audited = client._with_created_defaults("concerts", {"artist": "Yeat"})
    assert audited["created_by"] == "fd9dadab-baff-4dc0-9fe9-f73b3056bb91"
    assert audited["updated_by"] == "fd9dadab-baff-4dc0-9fe9-f73b3056bb91"

    unaudited = client._with_created_defaults("spotify_accounts", {"user_id": "x"})
    assert "created_by" not in unaudited
    assert "updated_by" not in unaudited


def test_created_defaults_do_not_override_explicit_values():
    client = NeonRestClient.__new__(NeonRestClient)
    client._actor_id = "fd9dadab-baff-4dc0-9fe9-f73b3056bb91"

    row = client._with_created_defaults("concerts", {"artist": "Yeat", "created_by": "other-actor"})
    assert row["created_by"] == "other-actor"


def test_updated_actor_always_overrides_on_audited_tables():
    client = NeonRestClient.__new__(NeonRestClient)
    client._actor_id = "fd9dadab-baff-4dc0-9fe9-f73b3056bb91"

    row = client._with_updated_actor("concerts", {"artist": "Yeat", "updated_by": "stale-actor"})
    assert row["updated_by"] == "fd9dadab-baff-4dc0-9fe9-f73b3056bb91"

    unaudited = client._with_updated_actor("api_idempotency_keys", {"response_status": 200})
    assert "updated_by" not in unaudited


def test_adapt_value_wraps_dicts_as_json_for_jsonb_columns():
    # Real bug caught live: psycopg3 has no implicit dict->jsonb adaptation,
    # so api_idempotency_keys.response_body (a plain dict) raised
    # "cannot adapt type 'dict'" until wrapped.
    adapted = _adapt_value({"restored": 3})
    assert isinstance(adapted, psycopg.types.json.Json)


def test_adapt_value_leaves_lists_alone_for_array_columns():
    # albums.genres is text[], which takes a native Python list directly --
    # wrapping it in Json() would send jsonb instead and break the column.
    value = ["pop", "rap"]
    assert _adapt_value(value) is value


def test_adapt_value_leaves_scalars_alone():
    assert _adapt_value("plain") == "plain"
    assert _adapt_value(None) is None
    assert _adapt_value(5) == 5


def test_json_safe_converts_uuid_decimal_and_datetime():
    # Real bug caught live: pydantic models expect the plain-string shapes
    # PostgREST returns; psycopg hands back native UUID/Decimal/date(time)
    # objects that fail validation (e.g. MemberSummary.user_id: str) unless
    # normalized here first.
    assert _json_safe(UUID("11111111-1111-4111-8111-111111111111")) == (
        "11111111-1111-4111-8111-111111111111"
    )
    assert _json_safe(Decimal("8.50")) == 8.5
    assert _json_safe(datetime(2026, 1, 1, 12, 0, 0)) == "2026-01-01T12:00:00"
    assert _json_safe(date(2026, 1, 1)) == "2026-01-01"
    assert _json_safe(None) is None
    assert _json_safe("plain") == "plain"


def test_json_safe_recurses_into_nested_containers():
    value = {"id": UUID("11111111-1111-4111-8111-111111111111"), "scores": [Decimal("1.5")]}
    assert _json_safe(value) == {
        "id": "11111111-1111-4111-8111-111111111111",
        "scores": [1.5],
    }


def test_json_safe_row_applies_to_every_column():
    row = {
        "id": UUID("11111111-1111-4111-8111-111111111111"),
        "price": Decimal("12.50"),
        "artist": "Yeat",
    }
    assert _json_safe_row(row) == {
        "id": "11111111-1111-4111-8111-111111111111",
        "price": 12.5,
        "artist": "Yeat",
    }
