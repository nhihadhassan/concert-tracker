"""Plain-Postgres (Neon) implementation of the SupabaseRestClient interface.

This mirrors backend.supabase_rest.SupabaseRestClient's six-method surface
exactly (request/select/insert/update/update_count/rpc) so every route module
that depends on `Depends(get_rest_client)` works unchanged regardless of which
backend is selected. See docs/DATA_PROVIDERS.md for the full port rationale.

The PostgREST filter vocabulary this project actually uses is small --
`eq.`, `is.null`, `order=col.asc/desc`, `limit`, `select=` column lists, plus
one `on_conflict` upsert and one raw DELETE (both in spotify_routes.py) -- so
it is translated directly to SQL here rather than reaching for an ORM.

created_by/updated_by: the ported schema's set_row_metadata() trigger no
longer resolves an actor via auth.uid() (Neon has no `auth` schema). Verified
against production that auth.uid() was already resolving to a single fixed
UUID there (the configured PUBLIC_USER_ID), so this client reproduces that
exact behavior by filling those columns itself -- coalesced on insert
(matching the old trigger's `coalesce(new.created_by, auth.uid())`), always
overwritten on update (matching `coalesce(auth.uid(), new.updated_by, ...)`,
where auth.uid() took priority when present).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from backend.supabase_rest import SupabaseRestError

# Tables that carry created_by/updated_by audit columns in db/neon/schema.sql.
# api_idempotency_keys and spotify_accounts do not, so they're excluded.
_AUDITED_TABLES = {
    "app_members",
    "rating_rule_versions",
    "concerts",
    "concert_attendees",
    "concert_reviews",
    "albums",
    "album_tracks",
    "album_reviews",
    "album_track_reviews",
}

_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _quote_ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise ValueError(f"Unexpected column/table name: {name!r}")
    return f'"{name}"'


def _split_filters(params: dict[str, Any] | None) -> dict[str, Any]:
    """Pull out select/order/limit/on_conflict, leaving only eq./is.null filters."""
    params = dict(params or {})
    reserved = {
        "select": params.pop("select", None),
        "order": params.pop("order", None),
        "limit": params.pop("limit", None),
        "on_conflict": params.pop("on_conflict", None),
    }
    return {"filters": params, **reserved}


def _where_clause(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    values: list[Any] = []
    for key, value in filters.items():
        column = _quote_ident(key)
        text = str(value)
        if text == "is.null":
            clauses.append(f"{column} IS NULL")
        elif text == "is.not.null":
            clauses.append(f"{column} IS NOT NULL")
        elif text.startswith("eq."):
            clauses.append(f"{column} = %s")
            values.append(text[3:])
        else:
            raise ValueError(f"Unsupported PostgREST filter: {key}={value!r}")
    if not clauses:
        return "", values
    return " WHERE " + " AND ".join(clauses), values


def _order_clause(order: str | None) -> str:
    if not order:
        return ""
    parts = []
    for segment in order.split(","):
        segment = segment.strip()
        if not segment:
            continue
        column, _, direction = segment.partition(".")
        direction = direction.upper() or "ASC"
        if direction not in {"ASC", "DESC"}:
            raise ValueError(f"Unsupported order direction: {segment!r}")
        parts.append(f"{_quote_ident(column)} {direction}")
    return " ORDER BY " + ", ".join(parts) if parts else ""


def _select_columns(select: str | None) -> str:
    if not select or select == "*":
        return "*"
    return ", ".join(_quote_ident(col.strip()) for col in select.split(","))


def _json_safe(value: Any) -> Any:
    """Normalizes psycopg's native return types to plain JSON shapes.

    Every caller downstream (pydantic models, route code) was written against
    PostgREST's JSON responses, where uuid/numeric/timestamptz columns always
    come back as plain strings. psycopg instead hands back UUID/Decimal/
    datetime/date objects, which fail pydantic validation (`user_id: UUID`
    where a `str` is expected) unless normalized here first.
    """
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _json_safe_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _json_safe(value) for key, value in row.items()}


def _adapt_value(value: Any) -> Any:
    """Wraps dict payload values so psycopg sends them as jsonb.

    psycopg3 has no implicit dict->jsonb adaptation (unlike psycopg2), so a
    plain dict (e.g. api_idempotency_keys.response_body) raises
    "cannot adapt type 'dict'" unless wrapped. Lists are left alone --
    they're needed for genuinely array-typed columns (albums.genres text[]),
    which take native Python lists directly, and no jsonb column in this
    schema ever receives a bare list.
    """
    if isinstance(value, dict):
        return psycopg.types.json.Json(value)
    return value


def _translate_pg_error(exc: psycopg.Error) -> SupabaseRestError:
    if isinstance(exc, psycopg.errors.UniqueViolation):
        return SupabaseRestError(409, str(exc).splitlines()[0])
    if isinstance(exc, psycopg.OperationalError):
        return SupabaseRestError(503, "Cloud data service is unavailable")
    message = str(exc).splitlines()[0] if str(exc) else "Cloud data request failed"
    return SupabaseRestError(500, message)


class NeonRestClient:
    def __init__(self, database_url: str, actor_id: UUID) -> None:
        if not database_url:
            raise SupabaseRestError(503, "Neon database is not configured")
        self._database_url = database_url
        self._actor_id = str(actor_id)

    def _connect(self) -> psycopg.Connection:
        try:
            return psycopg.connect(self._database_url, row_factory=dict_row, autocommit=True)
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc

    def _with_created_defaults(self, resource: str, row: dict[str, Any]) -> dict[str, Any]:
        if resource not in _AUDITED_TABLES:
            return row
        row = dict(row)
        row.setdefault("created_by", self._actor_id)
        row.setdefault("updated_by", self._actor_id)
        return row

    def _with_updated_actor(self, resource: str, row: dict[str, Any]) -> dict[str, Any]:
        if resource not in _AUDITED_TABLES:
            return row
        row = dict(row)
        row["updated_by"] = self._actor_id
        return row

    def select(
        self,
        resource: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        parts = _split_filters(params)
        where_sql, values = _where_clause(parts["filters"])
        sql = (
            f"SELECT {_select_columns(parts['select'])} FROM {_quote_ident(resource)}"
            f"{where_sql}{_order_clause(parts['order'])}"
        )
        if parts["limit"] is not None:
            sql += " LIMIT %s"
            values = [*values, int(parts["limit"])]
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(sql, values)
                return [_json_safe_row(row) for row in cur.fetchall()]
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc

    def insert(
        self,
        resource: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        rows = payload if isinstance(payload, list) else [payload]
        if not rows:
            return []
        rows = [self._with_created_defaults(resource, row) for row in rows]
        columns = list(rows[0].keys())
        if any(list(row.keys()) != columns for row in rows):
            raise ValueError("Batch insert rows must share the same columns")
        column_sql = ", ".join(_quote_ident(c) for c in columns)
        row_placeholder = "(" + ", ".join(["%s"] * len(columns)) + ")"
        values: list[Any] = []
        for row in rows:
            values.extend(_adapt_value(row[c]) for c in columns)
        placeholders = ", ".join([row_placeholder] * len(rows))
        sql = (
            f"INSERT INTO {_quote_ident(resource)} ({column_sql}) VALUES {placeholders} RETURNING *"
        )
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(sql, values)
                return [_json_safe_row(row) for row in cur.fetchall()]
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc

    def update(
        self,
        resource: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any],
        return_rows: bool = True,
    ) -> list[dict[str, Any]]:
        payload = self._with_updated_actor(resource, payload)
        parts = _split_filters(params)
        where_sql, where_values = _where_clause(parts["filters"])
        columns = list(payload.keys())
        set_sql = ", ".join(f"{_quote_ident(c)} = %s" for c in columns)
        returning = " RETURNING *" if return_rows else ""
        sql = f"UPDATE {_quote_ident(resource)} SET {set_sql}{where_sql}{returning}"
        values = [_adapt_value(payload[c]) for c in columns] + where_values
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(sql, values)
                return [_json_safe_row(row) for row in cur.fetchall()] if return_rows else []
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc

    def update_count(
        self,
        resource: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any],
    ) -> int:
        payload = self._with_updated_actor(resource, payload)
        parts = _split_filters(params)
        where_sql, where_values = _where_clause(parts["filters"])
        columns = list(payload.keys())
        set_sql = ", ".join(f"{_quote_ident(c)} = %s" for c in columns)
        sql = f"UPDATE {_quote_ident(resource)} SET {set_sql}{where_sql}"
        values = [_adapt_value(payload[c]) for c in columns] + where_values
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(sql, values)
                return cur.rowcount
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc

    def rpc(self, function: str, payload: dict[str, Any]) -> Any:
        # Only caller in this codebase is restore_encore_backup(payload, actor_id, mutation_id).
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_quote_ident(function)}(%s::jsonb, %s::uuid, %s::uuid)",
                    [
                        psycopg.types.json.Json(payload["payload"]),
                        payload["actor_id"],
                        payload["mutation_id"],
                    ],
                )
                row = cur.fetchone()
                return row[f"{function}"] if row else None
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc

    def request(
        self,
        method: str,
        resource: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        timeout: float = 12,
    ) -> None:
        """Handles the two raw call sites in spotify_routes.py.

        Neither caller inspects the return value, so this returns None rather
        than emulating httpx.Response -- unlike SupabaseRestClient.request,
        which is also used internally by select/insert/update there, this
        method is only reached directly from route code for the on_conflict
        upsert and the DELETE below.
        """
        parts = _split_filters(params)
        try:
            with self._connect() as conn, conn.cursor() as cur:
                is_upsert = (
                    method == "POST"
                    and parts["on_conflict"]
                    and prefer
                    and "merge-duplicates" in prefer
                )
                if is_upsert:
                    row = self._with_created_defaults(resource, dict(json))
                    columns = list(row.keys())
                    conflict_col = parts["on_conflict"]
                    update_sql = ", ".join(
                        f"{_quote_ident(c)} = EXCLUDED.{_quote_ident(c)}"
                        for c in columns
                        if c != conflict_col
                    )
                    sql = (
                        f"INSERT INTO {_quote_ident(resource)} "
                        f"({', '.join(_quote_ident(c) for c in columns)}) "
                        f"VALUES ({', '.join(['%s'] * len(columns))}) "
                        f"ON CONFLICT ({_quote_ident(conflict_col)}) DO UPDATE SET {update_sql}"
                    )
                    cur.execute(sql, [_adapt_value(row[c]) for c in columns])
                elif method == "DELETE":
                    where_sql, values = _where_clause(parts["filters"])
                    cur.execute(f"DELETE FROM {_quote_ident(resource)}{where_sql}", values)
                else:
                    raise ValueError(f"Unsupported raw request: {method} {resource}")
        except psycopg.Error as exc:
            raise _translate_pg_error(exc) from exc
        return None
