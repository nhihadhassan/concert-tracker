#!/usr/bin/env python3
"""Run the Stage 4 legacy-to-normalized migration against local copied data."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.domain.migration import (
    RULE_VERSION_ONE_ID,
    MigrationState,
    canonical_checksum,
    context_dict,
    context_from_auth_users,
    migrate_legacy_records,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cloud", type=Path, required=True, help="Legacy cloud table JSON array")
    parser.add_argument("--browser", type=Path, required=True, help="Browser localStorage snapshot")
    parser.add_argument(
        "--auth-users", type=Path, required=True, help="Non-secret Auth user metadata"
    )
    parser.add_argument("--existing", type=Path, help="Existing normalized migration state")
    parser.add_argument(
        "--baseline-rankings",
        type=Path,
        required=True,
        help="Approved Stage 0 cloud ranking fixture",
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="Private dry-run output directory"
    )
    parser.add_argument("--rating-rule-version-id", default=RULE_VERSION_ONE_ID)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    args = parse_args()
    cloud_rows = load_json(args.cloud)
    browser_snapshot = load_json(args.browser)
    auth_users = load_json(args.auth_users)
    baseline_rankings = load_json(args.baseline_rankings)
    existing = MigrationState.from_dict(load_json(args.existing)) if args.existing else None
    context = context_from_auth_users(
        auth_users,
        rating_rule_version_id=args.rating_rule_version_id,
        historical_rankings=baseline_rankings,
    )

    first = migrate_legacy_records(
        cloud_rows,
        browser_snapshot.get("data", []),
        context,
        existing=existing,
    )
    second = migrate_legacy_records(
        cloud_rows,
        browser_snapshot.get("data", []),
        context,
        existing=first.state,
    )
    first_checksum = canonical_checksum(first.state.to_dict())
    second_checksum = canonical_checksum(second.state.to_dict())
    second_operations = second.report["destination"]["operations"]
    idempotent = first_checksum == second_checksum and all(
        operations["inserted"] == 0 and operations["updated"] == 0
        for operations in second_operations.values()
    )
    if not idempotent:
        raise SystemExit("Migration rerun changed the destination state")

    args.output.mkdir(parents=True, exist_ok=True)
    for asset in first.extracted_assets:
        target = args.output / "storage" / asset.object_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(asset.content)

    captured_at = datetime.now(timezone.utc).isoformat()
    report = {
        **first.report,
        "captured_at": captured_at,
        "inputs": {
            "cloud": str(args.cloud),
            "browser": str(args.browser),
            "auth_users": str(args.auth_users),
            "baseline_rankings": str(args.baseline_rankings),
            "existing": str(args.existing) if args.existing else None,
        },
        "context": context_dict(context),
        "idempotency": {
            "passed": True,
            "first_checksum": first_checksum,
            "second_checksum": second_checksum,
            "second_run_operations": second_operations,
        },
    }
    write_json(args.output / "normalized.json", first.state.to_dict())
    write_json(args.output / "report.json", report)
    write_json(
        args.output / "manifest.json",
        {
            "captured_at": captured_at,
            "normalized_checksum": first_checksum,
            "report_checksum": canonical_checksum(report),
            "idempotent": True,
        },
    )
    counts = first.report["destination"]["counts"]
    print(
        "Stage 4 dry run passed: "
        f"{counts['concerts']} concerts, "
        f"{counts['concert_attendees']} attendees, "
        f"{counts['concert_reviews']} reviews; rerun made no changes."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
