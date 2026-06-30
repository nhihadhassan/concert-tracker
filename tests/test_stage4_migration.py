from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from backend.domain.migration import (
    MigrationContext,
    migrate_legacy_records,
    normalized_identity,
)

PRIVATE_CLOUD = Path(
    "data/backups/stage-2-pre-schema/20260630T143124Z/concert_tracker_concerts.json"
)
PRIVATE_BROWSER = Path("data/backups/stage-0/20260629T161654Z/browser-localstorage.json")
PRIVATE_AUTH = Path("data/backups/stage-2-pre-schema/20260630T143124Z/auth-users.json")


@pytest.fixture
def context() -> MigrationContext:
    return MigrationContext(
        nhihad_user_id="fd9dadab-baff-4dc0-9fe9-f73b3056bb91",
        rachel_user_id="4f6668ec-b31d-4692-977d-aec5dcdd19f1",
    )


def source_record(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "id": "cloud-a",
        "artist": "Example Artist",
        "date": "2024-05-01",
        "venue": "History",
        "status": "Attended",
        "price": 100,
        "genre": "Hip-Hop",
        "seat": "Floor",
        "projScore": 8,
        "enjoyment": 8,
        "stage": 8,
        "setlist": 8,
        "seatScore": 8,
        "realized": 9,
        "companions": "Rachel, Owen",
        "rachelAttended": True,
        "rachelScore": 9.5,
        "ownerEmail": "owner@example.com",
        "timestamp": "2024-05-02T12:00:00Z",
    }
    row.update(overrides)
    return row


def cloud_wrapper(record: dict[str, object]) -> dict[str, object]:
    return {
        "id": record["id"],
        "data": record,
        "updated_at": "2024-05-03T12:00:00Z",
    }


def test_cloud_wins_conflicts_and_browser_only_records_are_imported(
    context: MigrationContext,
) -> None:
    cloud = source_record(status="Attended", notes="Cloud note")
    browser_conflict = source_record(id="browser-other-id", status="Want to Go", notes="Old")
    browser_only = source_record(
        id="browser-only",
        artist="Browser Artist",
        date="2025-01-02",
        rachelAttended=False,
        rachelScore=None,
    )

    result = migrate_legacy_records(
        [cloud_wrapper(cloud)],
        [browser_conflict, browser_only],
        context,
    )

    assert result.report["source"] == {
        "cloud_input": 1,
        "cloud_converted": 1,
        "browser_input": 2,
        "browser_imported": 1,
        "browser_skipped": 1,
        "cloud_invalid": 0,
        "browser_invalid": 0,
        "invalid": 0,
        "canonical": 2,
    }
    converted = {row["artist"]: row for row in result.state.concerts}
    assert converted["Example Artist"]["status"] == "Attended"
    assert converted["Example Artist"]["notes"] == "Cloud note"
    assert converted["Example Artist"]["companions"] == "Rachel, Owen"
    assert "Browser Artist" in converted
    skipped = [event for event in result.report["events"] if event["action"] == "skipped"]
    assert skipped[0]["matched_by"] == "normalized artist/date"
    assert skipped[0]["changed_fields"] == ["notes", "status"]


def test_attendees_reviews_overrides_and_rerun_are_idempotent(
    context: MigrationContext,
) -> None:
    first = migrate_legacy_records(
        [cloud_wrapper(source_record())],
        [],
        context,
    )

    assert len(first.state.concert_attendees) == 2
    assert {row["user_id"] for row in first.state.concert_attendees} == {
        context.nhihad_user_id,
        context.rachel_user_id,
    }
    assert len(first.state.concert_reviews) == 2
    reviews = {row["reviewer_user_id"]: row for row in first.state.concert_reviews}
    assert reviews[context.nhihad_user_id]["rating_override"] == 9.0
    assert reviews[context.nhihad_user_id]["rating_override_reason"]
    assert reviews[context.rachel_user_id]["rating_override"] == 9.5
    assert first.report["reviews"]["nhihad_overrides"] == 1
    assert first.report["reviews"]["rachel_overrides"] == 1

    second = migrate_legacy_records(
        [cloud_wrapper(source_record())],
        [],
        context,
        existing=first.state,
    )
    assert second.state == first.state
    for operations in second.report["destination"]["operations"].values():
        assert operations["inserted"] == 0
        assert operations["updated"] == 0


def test_base64_artwork_is_extracted_to_content_addressed_storage(
    context: MigrationContext,
) -> None:
    image_bytes = b"small-image-fixture"
    image = "data:image/png;base64," + base64.b64encode(image_bytes).decode()
    record = source_record(image=image)

    result = migrate_legacy_records([cloud_wrapper(record)], [], context)

    assert result.report["artwork"]["base64_extracted"] == 1
    assert len(result.extracted_assets) == 1
    asset = result.extracted_assets[0]
    assert asset.content == image_bytes
    assert asset.object_path.startswith("concert-artwork/")
    assert result.state.concerts[0]["image_url"] == f"storage://{asset.object_path}"


def test_invalid_source_is_reported_without_creating_partial_rows(
    context: MigrationContext,
) -> None:
    invalid = source_record(venue=None)

    result = migrate_legacy_records([cloud_wrapper(invalid)], [], context)

    assert result.state.concerts == ()
    assert result.report["source"]["invalid"] == 1
    assert result.report["events"][0]["action"] == "invalid"
    assert "venue" in result.report["events"][0]["reason"]


@pytest.mark.skipif(
    not (PRIVATE_CLOUD.exists() and PRIVATE_BROWSER.exists() and PRIVATE_AUTH.exists()),
    reason="private Stage 0/2 backups are intentionally excluded from Git",
)
def test_private_stage_four_dry_run_matches_every_baseline_fixture() -> None:
    cloud = json.loads(PRIVATE_CLOUD.read_text())
    browser = json.loads(PRIVATE_BROWSER.read_text())["data"]
    auth_users = json.loads(PRIVATE_AUTH.read_text())
    by_email = {row["email"]: row["id"] for row in auth_users}
    expected_stats = json.loads(Path("docs/baseline/cloud-stats.json").read_text())
    expected_rankings = json.loads(Path("docs/baseline/cloud-rankings.json").read_text())
    context = MigrationContext(
        nhihad_user_id=by_email["owner@example.com"],
        rachel_user_id=by_email["partner@example.com"],
        historical_rank_by_identity={
            normalized_identity(row): row["rank"] for row in expected_rankings
        },
    )

    result = migrate_legacy_records(cloud, browser, context)
    counts = result.report["destination"]["counts"]
    verification = result.report["verification"]
    assert counts == {
        "concerts": 46,
        "concert_attendees": 66,
        "concert_reviews": 54,
        "artwork_assets": 0,
    }
    assert result.report["reviews"] == {
        "nhihad": 44,
        "rachel": 10,
        "nhihad_overrides": 38,
        "rachel_overrides": 10,
    }
    assert result.report["artwork"] == {
        "remote_urls": 14,
        "base64_extracted": 0,
        "empty": 32,
    }
    assert verification["total_concerts"] == expected_stats["totalConcerts"]
    assert verification["status_counts"] == expected_stats["statusCounts"]
    assert (
        verification["total_spent_excluding_cancelled"]
        == expected_stats["totalSpentExcludingCancelled"]
    )
    assert verification["nhihad_rated_concerts"] == expected_stats["ratedConcerts"]
    assert verification["nhihad_average_rating"] == expected_stats["averageRealizedRating"]
    actual_ranking = verification["rankings"][context.nhihad_user_id]
    assert [(row["artist"], row["date"], row["rating"]) for row in actual_ranking] == [
        (row["artist"], row["date"], row["realized"]) for row in expected_rankings
    ]

    source_by_id = {str(row["id"]): row["data"] for row in cloud}
    for concert in result.state.concerts:
        source = source_by_id[concert["legacy_source_id"]]
        assert concert["spotify_url"] == source.get("spotify")
        assert concert["image_url"] == source.get("image")
        assert concert["notes"] == source.get("notes")
        assert concert["companions"] == source.get("companions")
        assert concert["concert_date"] == source.get("date")
        assert concert["price"] == source.get("price")
        assert concert["seat"] == source.get("seat")

    rerun = migrate_legacy_records(cloud, browser, context, existing=result.state)
    assert rerun.state == result.state
    for operations in rerun.report["destination"]["operations"].values():
        assert operations["inserted"] == 0
        assert operations["updated"] == 0
