#!/usr/bin/env python3
"""Back up Supabase, load into Neon, and verify row-by-row parity.

Adapted from scripts/stage8_cutover.py's backup/apply/verify pattern
(canonical row normalization, checksum manifests, insert-only-missing,
rerun-is-a-no-op) but pointed at Neon instead of a second Supabase project,
and covering every table the app uses (concerts *and* the album journal),
not just the three Stage 8 covered.

Usage:
    python -m scripts.neon_cutover backup  --output data/backups/neon-cutover/<ts>
    python -m scripts.neon_cutover apply   --input  data/backups/neon-cutover/<ts>
    python -m scripts.neon_cutover verify  --input  data/backups/neon-cutover/<ts>

`backup` reads live Supabase (via the same SupabaseRestClient the app uses).
`apply` and `verify` read the reviewed JSON snapshot `backup` wrote, not a
fresh live fetch -- so what gets loaded into Neon is exactly what was
reviewed. Re-running `apply` against an already-loaded Neon database inserts
nothing further and `verify` reports zero diff, matching Stage 8's
rerun-is-a-no-op discipline.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections.abc import Callable, Mapping
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from uuid import UUID

from backend.domain.migration import canonical_checksum
from backend.neon_rest import NeonRestClient
from backend.settings import get_settings
from backend.supabase_rest import SupabaseRestClient

# Dependency order: every table is inserted only after the tables its foreign
# keys point at. concert_attendees/concert_reviews depend on concerts and
# app_members; album_tracks depends on albums; album_reviews depends on
# albums and app_members; album_track_reviews depends on album_reviews,
# album_tracks, and app_members.
TABLES = (
    "app_members",
    "rating_rule_versions",
    "concerts",
    "concert_attendees",
    "concert_reviews",
    "albums",
    "album_tracks",
    "album_reviews",
    "album_track_reviews",
    "spotify_accounts",
)

NUMERIC_FIELDS = {
    "price",
    "projected_rating",
    "enjoyment_score",
    "stage_score",
    "setlist_score",
    "seat_score",
    "rating_override",
    "enjoyment_weight",
    "stage_weight",
    "setlist_weight",
    "seat_weight",
    "maximum_rating",
    "overall_score",
    "score",
}
TIMESTAMP_FIELDS = {
    "created_at",
    "updated_at",
    "deleted_at",
    "effective_from",
    "retired_at",
    "connected_at",
    "published_at",
}

ROW_KEYS: dict[str, Callable[[Mapping[str, Any]], str]] = {
    "app_members": lambda row: str(row["user_id"]),
    "concert_attendees": lambda row: f"{row['concert_id']}:{row['user_id']}",
    "spotify_accounts": lambda row: str(row["user_id"]),
}


def row_key(table: str, row: Mapping[str, Any]) -> str:
    key_fn = ROW_KEYS.get(table)
    if key_fn:
        return key_fn(row)
    return str(row["id"])


def _to_json_safe(value: Any) -> Any:
    """Normalizes psycopg-native types (UUID/Decimal/datetime/date) to the
    same plain-JSON shapes Supabase's REST responses already use, so rows
    from either backend compare equal when they represent the same data.
    """
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return _normalized_number(str(value))
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _to_json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_json_safe(v) for v in value]
    return value


def _normalized_number(value: Any) -> str | None:
    if value is None:
        return None
    try:
        normalized = Decimal(str(value)).normalize()
    except InvalidOperation:
        return str(value)
    return format(normalized, "f")


_TIMESTAMP_RE = re.compile(r"(.+?:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}:\d{2})")


def _normalized_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).replace("Z", "+00:00")
    # Postgres/PostgREST trims trailing zeros from the fractional-seconds
    # component (e.g. ".82362" instead of ".823620"), but Python's
    # datetime.fromisoformat before 3.11 only accepts exactly 3 or 6 digits
    # there. Pad to 6 before parsing so both sources compare equal.
    match = _TIMESTAMP_RE.fullmatch(text)
    if match and match.group(2):
        fraction = match.group(2).ljust(6, "0")[:6]
        text = f"{match.group(1)}.{fraction}{match.group(3)}"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.isoformat()
    return parsed.astimezone(timezone.utc).isoformat()


def canonical_row(row: Mapping[str, Any], fields: list[str]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for field in fields:
        value = _to_json_safe(row.get(field))
        if field in NUMERIC_FIELDS:
            value = _normalized_number(value)
        elif field in TIMESTAMP_FIELDS:
            value = _normalized_timestamp(value)
        result[field] = value
    return result


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def load_table(input_dir: Path, table: str) -> list[dict[str, Any]]:
    path = input_dir / f"{table}.json"
    if not path.exists():
        raise SystemExit(f"Missing table snapshot: {path}")
    return json.loads(path.read_text())


def supabase_source() -> SupabaseRestClient:
    settings = get_settings()
    return SupabaseRestClient(settings.supabase_url, settings.rest_key)


def neon_destination() -> NeonRestClient:
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("Set DATABASE_URL to the Neon connection string first.")
    return NeonRestClient(settings.database_url, settings.public_user_id)


def cmd_backup(output: Path) -> None:
    rest = supabase_source()
    captured_at = datetime.now(timezone.utc).isoformat()
    tables: dict[str, list[dict[str, Any]]] = {}
    for table in TABLES:
        rows = rest.select(table, params={"select": "*", "limit": 10000})
        tables[table] = rows
        write_json(output / f"{table}.json", rows)
    manifest = {
        "captured_at": captured_at,
        "counts": {table: len(rows) for table, rows in tables.items()},
        "checksums": {
            table: canonical_checksum([canonical_row(row, sorted(row.keys())) for row in rows])
            for table, rows in tables.items()
        },
    }
    write_json(output / "manifest.json", manifest)
    print(f"Neon cutover backup: {manifest['counts']}")


def cmd_apply(input_dir: Path) -> None:
    rest = neon_destination()
    inserted: dict[str, int] = {}
    for table in TABLES:
        rows = load_table(input_dir, table)
        existing = rest.select(table, params={"select": "*"})
        existing_keys = {row_key(table, row) for row in existing}
        missing_rows = [row for row in rows if row_key(table, row) not in existing_keys]
        if missing_rows:
            rest.insert(table, missing_rows)
        inserted[table] = len(missing_rows)
    print(f"Neon cutover apply: inserted {inserted}")


def cmd_verify(input_dir: Path) -> dict[str, Any]:
    rest = neon_destination()
    report: dict[str, Any] = {}
    all_clean = True
    for table in TABLES:
        source_rows = load_table(input_dir, table)
        destination_rows = rest.select(table, params={"select": "*"})
        source_by_key = {row_key(table, row): row for row in source_rows}
        destination_by_key = {row_key(table, row): row for row in destination_rows}
        missing = sorted(set(source_by_key) - set(destination_by_key))
        extra = sorted(set(destination_by_key) - set(source_by_key))
        conflicts: list[dict[str, Any]] = []
        for key in sorted(set(source_by_key) & set(destination_by_key)):
            fields = sorted(source_by_key[key].keys())
            expected_row = canonical_row(source_by_key[key], fields)
            actual_row = canonical_row(destination_by_key[key], fields)
            if expected_row != actual_row:
                changed = sorted(
                    field for field in fields if expected_row[field] != actual_row[field]
                )
                conflicts.append({"key": key, "fields": changed})
        clean = not missing and not extra and not conflicts
        all_clean = all_clean and clean
        report[table] = {
            "source": len(source_rows),
            "destination": len(destination_rows),
            "missing": missing,
            "extra": extra,
            "conflicts": conflicts,
            "clean": clean,
        }
    report["complete"] = all_clean
    write_json(input_dir / "verify-report.json", report)
    status = "PASSED" if all_clean else "FAILED"
    print(f"Neon cutover verify: {status}")
    for table in TABLES:
        row = report[table]
        print(
            f"  {table}: source={row['source']} destination={row['destination']} "
            f"missing={len(row['missing'])} extra={len(row['extra'])} "
            f"conflicts={len(row['conflicts'])}"
        )
    if not all_clean:
        raise SystemExit("Verification found differences; see verify-report.json")
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("backup", "apply", "verify"))
    parser.add_argument("--output", type=Path, help="Directory for backup to write into")
    parser.add_argument("--input", type=Path, help="Directory apply/verify reads from")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "backup":
        if not args.output:
            raise SystemExit("--output is required for backup")
        args.output.mkdir(parents=True, exist_ok=True)
        os.chmod(args.output, 0o700)
        cmd_backup(args.output)
    elif args.command == "apply":
        if not args.input:
            raise SystemExit("--input is required for apply")
        cmd_apply(args.input)
    else:
        if not args.input:
            raise SystemExit("--input is required for verify")
        cmd_verify(args.input)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
