#!/usr/bin/env python3
"""Run the read-only Stage 9 production and recovery health audit."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import httpx

from sync.backup import read_state
from sync.cloud import authenticate, fetch_library
from sync.config import atomic_write_text, load_config
from sync.storage import TABLE_COLUMNS, build_dataset

PRODUCTION_URL = "https://concert-tracker-sepia.vercel.app"
OBSERVATION_STARTED = datetime(2026, 7, 3, 17, 45, tzinfo=timezone.utc)
CLEANUP_EARLIEST = OBSERVATION_STARTED + timedelta(days=30)
MAX_BACKUP_AGE = timedelta(hours=26)
SUPABASE_FREE_DATABASE_BYTES = 500 * 1024 * 1024
FREE_TIER_ALERT_PERCENT = 70.0


@dataclass(frozen=True)
class Check:
    name: str
    passed: bool
    detail: str


def parse_database_size(value: str) -> int:
    match = re.search(
        r"(?:postgres\s*\|\s*|database_size[^\d]*)([\d.]+)\s*(bytes|kB|MB|GB)",
        value,
    )
    if not match:
        raise ValueError("Supabase database size was not present in CLI output")
    amount = float(match.group(1))
    multiplier = {"bytes": 1, "kB": 1024, "MB": 1024**2, "GB": 1024**3}[match.group(2)]
    return round(amount * multiplier)


def cleanup_status(now: datetime) -> dict[str, Any]:
    current = now.astimezone(timezone.utc)
    elapsed = max(timedelta(0), current - OBSERVATION_STARTED)
    remaining = max(timedelta(0), CLEANUP_EARLIEST - current)
    return {
        "observation_started": OBSERVATION_STARTED.isoformat(),
        "cleanup_earliest": CLEANUP_EARLIEST.isoformat(),
        "days_elapsed": elapsed.days,
        "days_remaining": (remaining.days + (1 if remaining.seconds else 0)),
        "date_gate_passed": current >= CLEANUP_EARLIEST,
        "cleanup_allowed": False,
        "reason": "Explicit approval is still required after the date gate passes.",
    }


def backup_age(state: dict[str, Any], now: datetime) -> timedelta | None:
    value = state.get("last_success_at")
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc) - parsed.astimezone(timezone.utc)


def sqlite_health(path: Path, expected_counts: dict[str, int]) -> tuple[bool, str]:
    if not path.exists():
        return False, f"missing: {path}"
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        integrity = connection.execute("pragma integrity_check").fetchone()[0]
        counts = {
            table: connection.execute(f"select count(*) from {table}").fetchone()[0]
            for table in TABLE_COLUMNS
        }
    finally:
        connection.close()
    passed = integrity == "ok" and counts == expected_counts
    return passed, f"integrity={integrity}; counts={counts}"


def workbook_health(path: Path) -> tuple[bool, str]:
    if not path.exists():
        return False, f"missing: {path}"
    try:
        with ZipFile(path) as archive:
            error = archive.testzip()
    except Exception as exc:
        return False, f"invalid workbook: {exc}"
    return error is None, "ZIP package valid" if error is None else f"corrupt member: {error}"


def run_command(args: list[str], root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=root, capture_output=True, text=True, check=False)


def run_monitor(now: datetime | None = None) -> dict[str, Any]:
    captured_at = now or datetime.now(timezone.utc)
    config = load_config()
    checks: list[Check] = []

    with httpx.Client(timeout=30) as client:
        health = client.get(f"{PRODUCTION_URL}/api/v1/health")
        checks.append(Check("production_health", health.status_code == 200, health.text[:300]))
        private = client.get(f"{PRODUCTION_URL}/api/v1/library")
        checks.append(
            Check(
                "unauthenticated_library",
                private.status_code == 401,
                f"HTTP {private.status_code}",
            )
        )

    session = authenticate(config)
    library = fetch_library(config, session)
    dataset = build_dataset(
        library,
        fetched_at=captured_at,
        source_url=config.supabase_url,
        owner_email=config.owner_email,
    )
    state = read_state()
    age = backup_age(state, captured_at)
    checks.append(
        Check(
            "backup_freshness",
            age is not None and age <= MAX_BACKUP_AGE,
            "missing" if age is None else f"{age.total_seconds() / 3600:.2f} hours",
        )
    )
    checks.append(
        Check(
            "backup_counts",
            state.get("counts") == dataset.metadata["counts"],
            f"cloud={dataset.metadata['counts']}; backup={state.get('counts')}",
        )
    )
    checks.append(
        Check(
            "backup_checksums",
            state.get("checksums") == dataset.metadata["checksums"],
            "cloud and local checksums match"
            if state.get("checksums") == dataset.metadata["checksums"]
            else "cloud and local checksums differ",
        )
    )
    sqlite_ok, sqlite_detail = sqlite_health(
        Path(state.get("sqlite_path", config.data_dir / "concert_tracker.sqlite3")),
        dataset.metadata["counts"],
    )
    checks.append(Check("sqlite_backup", sqlite_ok, sqlite_detail))
    workbook_ok, workbook_detail = workbook_health(
        Path(state.get("workbook_path", config.exports_dir / "concerts-latest.xlsx"))
    )
    checks.append(Check("excel_backup", workbook_ok, workbook_detail))

    deployment = run_command(
        ["npx", "vercel", "inspect", PRODUCTION_URL, "--format=json"], config.root
    )
    try:
        deployment_data = json.loads(deployment.stdout)
    except json.JSONDecodeError:
        deployment_data = {}
    deployment_ok = (
        deployment.returncode == 0
        and deployment_data.get("target") == "production"
        and deployment_data.get("readyState") == "READY"
        and "concert-tracker-sepia.vercel.app" in deployment_data.get("aliases", [])
    )
    deployment_id = str(deployment_data.get("id") or "")
    checks.append(
        Check(
            "vercel_deployment",
            deployment_ok,
            f"id={deployment_data.get('id')}; state={deployment_data.get('readyState')}",
        )
    )
    error_logs = run_command(
        [
            "npx",
            "vercel",
            "logs",
            deployment_id,
            "--level",
            "error",
            "--since",
            "168h",
            "--limit",
            "100",
            "--no-color",
        ],
        config.root,
    )
    error_log_output = error_logs.stdout + error_logs.stderr
    no_errors = error_logs.returncode == 0 and "No logs found" in error_log_output
    checks.append(
        Check(
            "vercel_error_logs",
            no_errors,
            "no errors in the last 7 days" if no_errors else error_log_output[-500:],
        )
    )

    database_stats = run_command(
        ["npx", "supabase", "inspect", "db", "db-stats", "--linked"], config.root
    )
    try:
        database_bytes = parse_database_size(database_stats.stdout + database_stats.stderr)
        database_percent = database_bytes / SUPABASE_FREE_DATABASE_BYTES * 100
        database_ok = database_percent < FREE_TIER_ALERT_PERCENT
        database_detail = f"{database_bytes} bytes ({database_percent:.2f}% of 500 MB)"
    except ValueError as exc:
        database_bytes = None
        database_percent = None
        database_ok = False
        database_detail = str(exc)
    checks.append(Check("supabase_database_usage", database_ok, database_detail))

    report = {
        "captured_at": captured_at.isoformat(),
        "production_url": PRODUCTION_URL,
        "production_deployment": deployment_id,
        "checks": [asdict(check) for check in checks],
        "passed": all(check.passed for check in checks),
        "cloud_counts": dataset.metadata["counts"],
        "database_bytes": database_bytes,
        "database_percent_of_free_limit": database_percent,
        "cleanup": cleanup_status(captured_at),
    }
    output_dir = config.data_dir / "monitoring" / "stage-9"
    stamp = captured_at.strftime("%Y%m%dT%H%M%SZ")
    encoded = json.dumps(report, indent=2, sort_keys=True) + "\n"
    atomic_write_text(output_dir / f"health-{stamp}.json", encoded)
    atomic_write_text(output_dir / "latest.json", encoded)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print the complete JSON report.")
    args = parser.parse_args()
    report = run_monitor()
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        passed = sum(1 for check in report["checks"] if check["passed"])
        total = len(report["checks"])
        print(
            f"Stage 9 monitor: {passed}/{total} checks passed; "
            f"database={report['database_percent_of_free_limit']:.2f}% of free limit; "
            f"cleanup gate={report['cleanup']['days_remaining']} days remaining."
        )
        for check in report["checks"]:
            if not check["passed"]:
                print(f"FAIL {check['name']}: {check['detail']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
