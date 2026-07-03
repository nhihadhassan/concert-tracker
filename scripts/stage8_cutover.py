#!/usr/bin/env python3
"""Back up, apply, and verify the Stage 8 normalized production data cutover."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import httpx

from backend.domain.migration import canonical_checksum
from scripts.stage2_setup import SERVICE_KEY_SERVICE, read_keychain

TABLES = ("concerts", "concert_attendees", "concert_reviews")
BACKUP_TABLES = (
    "app_members",
    "rating_rule_versions",
    "concerts",
    "concert_attendees",
    "concert_reviews",
    "concert_tracker_concerts",
)
NUMERIC_FIELDS = {
    "price",
    "projected_rating",
    "enjoyment_score",
    "stage_score",
    "setlist_score",
    "seat_score",
    "rating_override",
}
TIMESTAMP_FIELDS = {"created_at", "updated_at", "deleted_at"}
EXPECTED_RULE = {
    "version": 1,
    "enjoyment_weight": "0.5",
    "stage_weight": "0.1666667",
    "setlist_weight": "0.1666667",
    "seat_weight": "0.1666666",
    "rounds_to": 1,
    "maximum_rating": "10",
    "renormalize_missing": True,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("backup", "plan", "apply", "verify"),
        help="Operation to perform against the linked Supabase project.",
    )
    parser.add_argument("--normalized", type=Path, help="Reviewed normalized.json input")
    parser.add_argument("--output", type=Path, required=True, help="Private report directory")
    return parser.parse_args()


def load_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        raise SystemExit("Set SUPABASE_URL to the linked Supabase project URL.")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_key:
        try:
            service_key = read_keychain(SERVICE_KEY_SERVICE)
        except subprocess.CalledProcessError as exc:
            raise SystemExit(f"Missing Keychain service: {SERVICE_KEY_SERVICE}") from exc
    return url, service_key


def service_headers(service_key: str, *, prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def fetch_table(
    client: httpx.Client,
    url: str,
    service_key: str,
    table: str,
) -> list[dict[str, Any]]:
    response = client.get(
        f"{url}/rest/v1/{table}",
        headers=service_headers(service_key),
        params={"select": "*", "limit": 1000},
    )
    response.raise_for_status()
    return response.json()


def fetch_active_destination(
    client: httpx.Client,
    url: str,
    service_key: str,
) -> dict[str, list[dict[str, Any]]]:
    rows = {table: fetch_table(client, url, service_key, table) for table in TABLES}
    active_concerts = [row for row in rows["concerts"] if row.get("deleted_at") is None]
    active_ids = {str(row["id"]) for row in active_concerts}
    return {
        "concerts": active_concerts,
        "concert_attendees": [
            row
            for row in rows["concert_attendees"]
            if row.get("deleted_at") is None and str(row["concert_id"]) in active_ids
        ],
        "concert_reviews": [
            row
            for row in rows["concert_reviews"]
            if row.get("deleted_at") is None and str(row["concert_id"]) in active_ids
        ],
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def row_key(table: str, row: Mapping[str, Any]) -> str:
    if table == "concert_attendees":
        return f"{row['concert_id']}:{row['user_id']}"
    return str(row["id"])


def _normalized_number(value: Any) -> str | None:
    if value is None:
        return None
    try:
        normalized = Decimal(str(value)).normalize()
    except InvalidOperation:
        return str(value)
    return format(normalized, "f")


def _normalized_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    timestamp = str(value).replace("Z", "+00:00")
    match = re.fullmatch(r"(.+?:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}:\d{2})", timestamp)
    if match and match.group(2):
        fraction = match.group(2).ljust(6, "0")[:6]
        timestamp = f"{match.group(1)}.{fraction}{match.group(3)}"
    parsed = datetime.fromisoformat(timestamp)
    return parsed.astimezone(timezone.utc).isoformat()


def canonical_row(row: Mapping[str, Any], fields: Iterable[str]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for field in fields:
        value = row.get(field)
        if field in NUMERIC_FIELDS:
            value = _normalized_number(value)
        elif field in TIMESTAMP_FIELDS:
            value = _normalized_timestamp(value)
        result[field] = value
    return result


def compare_destination(
    normalized: Mapping[str, Any], destination: Mapping[str, list[dict[str, Any]]]
) -> dict[str, Any]:
    report: dict[str, Any] = {}
    conflicts: list[dict[str, Any]] = []
    for table in TABLES:
        source_rows = list(normalized.get(table, []))
        destination_rows = destination.get(table, [])
        source_by_key = {row_key(table, row): row for row in source_rows}
        destination_by_key = {row_key(table, row): row for row in destination_rows}
        missing = sorted(set(source_by_key) - set(destination_by_key))
        extra = sorted(set(destination_by_key) - set(source_by_key))
        for key in sorted(set(source_by_key) & set(destination_by_key)):
            source = source_by_key[key]
            actual = destination_by_key[key]
            expected_row = canonical_row(source, source.keys())
            actual_row = canonical_row(actual, source.keys())
            if expected_row != actual_row:
                changed = sorted(
                    field for field in expected_row if expected_row[field] != actual_row[field]
                )
                conflicts.append({"table": table, "key": key, "fields": changed})
        report[table] = {
            "source": len(source_rows),
            "destination": len(destination_rows),
            "missing": missing,
            "extra": extra,
            "source_checksum": canonical_checksum(
                [canonical_row(row, row.keys()) for row in source_rows]
            ),
        }
    report["conflicts"] = conflicts
    return report


def validate_context(
    normalized: Mapping[str, Any],
    members: list[dict[str, Any]],
    rules: list[dict[str, Any]],
) -> None:
    member_ids = {str(row["user_id"]) for row in members if row.get("is_active")}
    expected_member_ids = {str(row["user_id"]) for row in normalized.get("concert_attendees", [])}
    if expected_member_ids != member_ids:
        raise SystemExit("Normalized attendee user IDs do not match active app members.")
    active_rules = {
        str(row["id"]): row
        for row in rules
        if row.get("retired_at") is None and row.get("deleted_at") is None
    }
    review_rule_ids = {
        str(row["rating_rule_version_id"])
        for row in normalized.get("concert_reviews", [])
        if row.get("rating_rule_version_id")
    }
    if len(review_rule_ids) != 1 or not review_rule_ids <= set(active_rules):
        raise SystemExit("Normalized reviews do not reference the active rating rule.")
    live_rule = active_rules[next(iter(review_rule_ids))]
    actual_rule = {
        "version": live_rule.get("version"),
        "enjoyment_weight": _normalized_number(live_rule.get("enjoyment_weight")),
        "stage_weight": _normalized_number(live_rule.get("stage_weight")),
        "setlist_weight": _normalized_number(live_rule.get("setlist_weight")),
        "seat_weight": _normalized_number(live_rule.get("seat_weight")),
        "rounds_to": live_rule.get("rounds_to"),
        "maximum_rating": _normalized_number(live_rule.get("maximum_rating")),
        "renormalize_missing": live_rule.get("renormalize_missing"),
    }
    if actual_rule != EXPECTED_RULE:
        raise SystemExit("The active rating rule does not match the approved Stage 3 formula.")


def backup(
    client: httpx.Client,
    url: str,
    service_key: str,
    output: Path,
) -> dict[str, Any]:
    captured_at = datetime.now(timezone.utc).isoformat()
    tables: dict[str, list[dict[str, Any]]] = {}
    for table in BACKUP_TABLES:
        tables[table] = fetch_table(client, url, service_key, table)
        write_json(output / f"{table}.json", tables[table])
    manifest = {
        "captured_at": captured_at,
        "counts": {table: len(rows) for table, rows in tables.items()},
        "checksums": {table: canonical_checksum(rows) for table, rows in tables.items()},
    }
    write_json(output / "manifest.json", manifest)
    return manifest


def insert_missing(
    client: httpx.Client,
    url: str,
    service_key: str,
    table: str,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0
    conflict_target = "concert_id,user_id" if table == "concert_attendees" else "id"
    response = client.post(
        f"{url}/rest/v1/{table}",
        headers=service_headers(service_key, prefer="return=representation"),
        params={"on_conflict": conflict_target},
        json=rows,
    )
    response.raise_for_status()
    inserted = response.json()
    if len(inserted) != len(rows):
        raise RuntimeError(f"{table}: inserted {len(inserted)} of {len(rows)} expected rows")
    return len(inserted)


def load_normalized(path: Path | None) -> dict[str, Any]:
    if path is None:
        raise SystemExit("--normalized is required for plan, apply, and verify.")
    value = json.loads(path.read_text())
    for table in TABLES:
        if not isinstance(value.get(table), list):
            raise SystemExit(f"Normalized input is missing table: {table}")
    return value


def main() -> int:
    args = parse_args()
    url, service_key = load_config()
    args.output.mkdir(parents=True, exist_ok=True)
    os.chmod(args.output, 0o700)

    with httpx.Client(timeout=30) as client:
        if args.command == "backup":
            manifest = backup(client, url, service_key, args.output)
            print(f"Stage 8 backup passed: {manifest['counts']}")
            return 0

        normalized = load_normalized(args.normalized)
        members = fetch_table(client, url, service_key, "app_members")
        rules = fetch_table(client, url, service_key, "rating_rule_versions")
        validate_context(normalized, members, rules)
        before = fetch_active_destination(client, url, service_key)
        planned = compare_destination(normalized, before)
        if planned["conflicts"] or any(planned[table]["extra"] for table in TABLES):
            write_json(args.output / "cutover-plan.json", planned)
            raise SystemExit("Destination conflicts or unexpected rows require manual review.")

        inserted = {table: 0 for table in TABLES}
        if args.command == "apply":
            for table in TABLES:
                existing_keys = {row_key(table, row) for row in before[table]}
                missing_rows = [
                    row for row in normalized[table] if row_key(table, row) not in existing_keys
                ]
                inserted[table] = insert_missing(client, url, service_key, table, missing_rows)

        after = fetch_active_destination(client, url, service_key)
        verified = compare_destination(normalized, after)
        complete = not verified["conflicts"] and all(
            not verified[table]["missing"] and not verified[table]["extra"] for table in TABLES
        )
        report = {
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "command": args.command,
            "inserted": inserted,
            "before": planned,
            "after": verified,
            "complete": complete,
        }
        write_json(args.output / "cutover-report.json", report)
        if args.command == "plan":
            print(
                "Stage 8 plan passed: "
                + ", ".join(f"{table}={len(planned[table]['missing'])} pending" for table in TABLES)
            )
            return 0
        if not complete:
            raise SystemExit("Post-cutover verification did not match the reviewed input.")
        print(
            f"Stage 8 {args.command} passed: "
            + ", ".join(f"{table}={len(after[table])}" for table in TABLES)
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
