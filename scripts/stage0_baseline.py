#!/usr/bin/env python3
"""Create recoverable legacy backups and non-sensitive Stage 0 fixtures."""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "index.html"
WORKBOOK_PATH = ROOT / "Nhihad's Concerts  (Responses).xlsx"
SUPABASE_URL = "https://zgafubhzhxikuknihmnu.supabase.co"
CLOUD_TABLE = "concert_tracker_concerts"
OWNER_EMAIL = "owner@example.com"
RACHEL_EMAIL = "partner@example.com"
KEYCHAIN_SERVICE = "Concert Tracker Supabase Service Role"

FIELD_MAP = {
    "Timestamp": "timestamp",
    "Artist": "artist",
    "Tour Name": "tour",
    "Date": "date",
    "Venue": "venue",
    "Price": "price",
    "Genre": "genre",
    "Projected Rating Score": "projScore",
    "Enjoyment Score": "enjoyment",
    "Stage Score": "stage",
    "Setlist Score": "setlist",
    "Seat Score": "seatScore",
    "Realized Rating": "realized",
    "Spotify Set List": "spotify",
    "Seat": "seat",
    "Notes": "notes",
    "Who did you go with": "companions",
    "Type": "type",
    "Rachel''s Score": "rachelScore",
}
NUMERIC_FIELDS = {
    "price",
    "projScore",
    "enjoyment",
    "stage",
    "setlist",
    "seatScore",
    "realized",
    "rachelScore",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser-json", type=Path)
    parser.add_argument("--output-root", type=Path, default=ROOT / "data" / "backups" / "stage-0")
    return parser.parse_args()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_seed() -> list[dict[str, Any]]:
    source = INDEX_PATH.read_text()
    match = re.search(r"const SEED = (\[.*?\]);\n", source, re.DOTALL)
    if not match:
        raise RuntimeError("Could not locate the embedded SEED array")
    return json.loads(match.group(1))


def column_name(cell_ref: str) -> str:
    match = re.match(r"[A-Z]+", cell_ref)
    if not match:
        raise ValueError(f"Invalid cell reference: {cell_ref}")
    return match.group(0)


def excel_datetime(value: str, include_time: bool) -> str:
    parsed = datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=float(value))
    return parsed.isoformat().replace("+00:00", "Z") if include_time else parsed.date().isoformat()


def clean_value(field: str, value: Any) -> Any:
    if value in (None, "", "N/A", "NA"):
        return None
    if field in NUMERIC_FIELDS:
        return float(value)
    if field == "timestamp":
        return excel_datetime(str(value), include_time=True)
    if field == "date":
        return excel_datetime(str(value), include_time=False)
    return str(value).strip()


def extract_workbook_rows() -> list[dict[str, Any]]:
    main_ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    with ZipFile(WORKBOOK_PATH) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iter(f"{{{main_ns}}}t"))
            for item in shared_root
        ]
        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        raw_rows: list[dict[str, Any]] = []
        for row in sheet_root.findall(f".//{{{main_ns}}}sheetData/{{{main_ns}}}row"):
            values: dict[str, Any] = {}
            for cell in row.findall(f"{{{main_ns}}}c"):
                value_node = cell.find(f"{{{main_ns}}}v")
                value: Any = None if value_node is None else value_node.text
                if cell.attrib.get("t") == "s" and value is not None:
                    value = shared[int(value)]
                values[column_name(cell.attrib["r"])] = value
            raw_rows.append(values)

    headers = raw_rows[0]
    column_fields = {column: FIELD_MAP.get(str(label)) for column, label in headers.items()}
    records: list[dict[str, Any]] = []
    for raw in raw_rows[1:]:
        artist_column = next((col for col, field in column_fields.items() if field == "artist"), None)
        if not artist_column or not raw.get(artist_column):
            continue
        record: dict[str, Any] = {}
        for column, field in column_fields.items():
            if field:
                record[field] = clean_value(field, raw.get(column))
        records.append(record)
    return records


def status_for(record: dict[str, Any]) -> str:
    if re.search("cancel", str(record.get("notes") or ""), re.IGNORECASE):
        return "Cancelled"
    if record.get("realized") is not None:
        return "Attended"
    return "Want to Go"


def weighted_rating(record: dict[str, Any], cap_at_ten: bool = False) -> float | None:
    weighted = (
        (record.get("enjoyment"), 0.5),
        (record.get("stage"), 1 / 6),
        (record.get("setlist"), 1 / 6),
        (record.get("seatScore"), 1 / 6),
    )
    present = [(float(value), weight) for value, weight in weighted if value is not None]
    if not present:
        return None
    result = sum(value * weight for value, weight in present) / sum(weight for _, weight in present)
    if cap_at_ten:
        result = min(10.0, result)
    return round(result + 1e-9, 1)


def normalized_key(record: dict[str, Any]) -> str:
    return f"{str(record.get('artist') or '').strip().casefold()}|{record.get('date') or ''}"


def records_checksum(records: list[dict[str, Any]]) -> str:
    payload = json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def compare_core_fields(
    baseline: list[dict[str, Any]],
    candidate: list[dict[str, Any]],
    fields: list[str] | None = None,
) -> dict[str, Any]:
    fields = fields or [field for field in FIELD_MAP.values() if field != "timestamp"]
    baseline_by_key = {normalized_key(record): record for record in baseline}
    candidate_by_key = {normalized_key(record): record for record in candidate}
    differences: list[dict[str, Any]] = []
    by_field: Counter[str] = Counter()
    for key in sorted(baseline_by_key.keys() & candidate_by_key.keys()):
        left = baseline_by_key[key]
        right = candidate_by_key[key]
        changed = []
        for field in fields:
            left_value = left.get(field)
            right_value = right.get(field)
            if isinstance(left_value, str):
                left_value = left_value.strip()
            if isinstance(right_value, str):
                right_value = right_value.strip()
            if left_value != right_value:
                changed.append(field)
                by_field[field] += 1
        if changed:
            differences.append({"key": key, "fields": changed})
    return {
        "matchingRecords": len(baseline_by_key.keys() & candidate_by_key.keys()),
        "recordsWithDifferences": len(differences),
        "differencesByField": dict(sorted(by_field.items())),
        "records": differences,
    }


def build_stats(records: list[dict[str, Any]]) -> dict[str, Any]:
    rows = [{**record, "status": record.get("status") or status_for(record)} for record in records]
    counts = Counter(record["status"] for record in rows)
    spent = sum(float(record.get("price") or 0) for record in rows if record["status"] != "Cancelled")
    rated = [record for record in rows if record.get("realized") is not None]
    return {
        "totalConcerts": len(rows),
        "statusCounts": dict(sorted(counts.items())),
        "totalSpentExcludingCancelled": round(spent, 2),
        "ratedConcerts": len(rated),
        "averageRealizedRating": round(sum(float(row["realized"]) for row in rated) / len(rated), 2),
        "dateRange": {
            "first": min((row.get("date") for row in rows if row.get("date")), default=None),
            "last": max((row.get("date") for row in rows if row.get("date")), default=None),
        },
    }


def build_rankings(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = [record for record in records if record.get("realized") is not None]
    ranked.sort(key=lambda row: float(row["realized"]), reverse=True)
    return [
        {
            "rank": index,
            "artist": row.get("artist"),
            "date": row.get("date"),
            "realized": row.get("realized"),
            "projected": row.get("projScore"),
            "price": row.get("price"),
            "currentWeightedSuggestion": weighted_rating(row),
            "plannedCappedSuggestion": weighted_rating(row, cap_at_ten=True),
        }
        for index, row in enumerate(ranked, start=1)
    ]


def load_service_key() -> str | None:
    environment_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if environment_key:
        return environment_key.strip()
    try:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                getpass.getuser(),
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ],
            capture_output=True,
            check=False,
            text=True,
        )
    except FileNotFoundError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def export_cloud(target: Path) -> dict[str, Any]:
    service_key = load_service_key()
    host = SUPABASE_URL.removeprefix("https://")
    try:
        socket.getaddrinfo(host, 443)
    except socket.gaierror as exc:
        return {"status": "blocked", "reason": f"Supabase endpoint does not resolve: {exc}"}
    if not service_key:
        return {
            "status": "blocked",
            "reason": f"Service-role key not found in the environment or macOS Keychain service '{KEYCHAIN_SERVICE}'",
        }
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{CLOUD_TABLE}?select=id,data,updated_at",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            rows = json.loads(response.read())
    except (urllib.error.URLError, urllib.error.HTTPError) as exc:
        return {"status": "blocked", "reason": f"Cloud export failed: {exc}"}
    write_json(target, {"capturedAt": datetime.now(timezone.utc).isoformat(), "rows": rows})
    return {"status": "complete", "rows": len(rows), "file": target.name}


def main() -> int:
    args = parse_args()
    captured_at = datetime.now(timezone.utc)
    stamp = captured_at.strftime("%Y%m%dT%H%M%SZ")
    backup_dir = args.output_root / stamp
    backup_dir.mkdir(parents=True, exist_ok=True)

    seed = extract_seed()
    workbook = extract_workbook_rows()
    write_json(backup_dir / "embedded-seed.json", {"capturedAt": captured_at.isoformat(), "records": seed})
    write_json(backup_dir / "source-workbook-rows.json", {"capturedAt": captured_at.isoformat(), "records": workbook})
    shutil.copy2(WORKBOOK_PATH, backup_dir / WORKBOOK_PATH.name)
    shutil.copy2(INDEX_PATH, backup_dir / "legacy-index.html")

    browser_records: list[dict[str, Any]] = []
    if args.browser_json and args.browser_json.exists():
        browser_snapshot = json.loads(args.browser_json.read_text())
        browser_records = browser_snapshot.get("data", [])
        write_json(backup_dir / "browser-localstorage.json", browser_snapshot)

    cloud = export_cloud(backup_dir / "cloud-table.json")
    cloud_records: list[dict[str, Any]] = []
    if cloud.get("status") == "complete":
        cloud_rows = json.loads((backup_dir / "cloud-table.json").read_text()).get("rows", [])
        cloud_records = [
            {
                **(row.get("data") or {}),
                "id": row.get("id"),
                "cloudUpdatedAt": row.get("updated_at"),
            }
            for row in cloud_rows
        ]
        cloud["checksum"] = records_checksum(cloud_records)
    canonical = browser_records or seed
    fixture_dir = ROOT / "docs" / "baseline"
    write_json(fixture_dir / "current-stats.json", build_stats(canonical))
    write_json(fixture_dir / "current-rankings.json", build_rankings(canonical))
    if cloud_records:
        write_json(fixture_dir / "cloud-stats.json", build_stats(cloud_records))
        write_json(fixture_dir / "cloud-rankings.json", build_rankings(cloud_records))
    write_json(
        fixture_dir / "field-schema.json",
        {
            "source": "legacy index.html and source workbook",
            "fields": list(FIELD_MAP.values()) + ["status", "rachelAttended", "ownerEmail", "id"],
            "required": {
                "all": ["artist", "date", "venue"],
                "Attended": ["price", "seat", "genre", "realized"],
            },
        },
    )

    seed_keys = {normalized_key(record) for record in seed}
    workbook_keys = {normalized_key(record) for record in workbook}
    browser_keys = {normalized_key(record) for record in browser_records}
    cloud_keys = {normalized_key(record) for record in cloud_records}
    browser_cloud_fields = [
        field for field in FIELD_MAP.values() if field != "timestamp"
    ] + ["status", "rachelAttended", "ownerEmail"]
    manifest = {
        "capturedAt": captured_at.isoformat(),
        "backupDirectory": str(backup_dir.relative_to(ROOT)),
        "sources": {
            "embeddedSeed": {"count": len(seed), "checksum": records_checksum(seed)},
            "sourceWorkbook": {"count": len(workbook), "checksum": records_checksum(workbook)},
            "browserLocalStorage": {
                "count": len(browser_records),
                "checksum": records_checksum(browser_records) if browser_records else None,
            },
            "cloudTable": cloud,
        },
        "normalizedKeyComparison": {
            "seedVsWorkbookMatch": seed_keys == workbook_keys,
            "seedOnly": sorted(seed_keys - workbook_keys),
            "workbookOnly": sorted(workbook_keys - seed_keys),
            "seedVsBrowserMatch": bool(browser_records) and seed_keys == browser_keys,
            "seedOnlyVsBrowser": sorted(seed_keys - browser_keys) if browser_records else [],
            "browserOnly": sorted(browser_keys - seed_keys) if browser_records else [],
            "cloudVsBrowserMatch": bool(cloud_records) and cloud_keys == browser_keys,
            "cloudOnly": sorted(cloud_keys - browser_keys) if cloud_records else [],
            "browserOnlyVsCloud": sorted(browser_keys - cloud_keys) if cloud_records else [],
        },
        "coreFieldComparison": {
            "seedVsWorkbook": compare_core_fields(seed, workbook),
            "seedVsBrowser": compare_core_fields(seed, browser_records) if browser_records else None,
            "browserVsCloud": compare_core_fields(
                browser_records, cloud_records, browser_cloud_fields
            ) if browser_records and cloud_records else None,
        },
    }
    for path in sorted(backup_dir.iterdir()):
        if path.is_file():
            manifest.setdefault("files", {})[path.name] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    write_json(backup_dir / "manifest.json", manifest)
    write_json(fixture_dir / "source-comparison.json", manifest)
    print(json.dumps(manifest, indent=2))
    return 0 if cloud.get("status") == "complete" else 2


if __name__ == "__main__":
    sys.exit(main())
