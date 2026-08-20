from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from sync.backup import backup_is_due
from sync.cloud import _rest_client
from sync.config import BackupConfig
from sync.launchd import LABEL, build_plist, configured_executable
from sync.storage import build_dataset, prune_archives, verify_sqlite, write_sqlite_atomic

OWNER_EMAIL = "owner@example.com"
USER_ID = "11111111-1111-4111-8111-111111111111"


def config(tmp_path: Path) -> BackupConfig:
    return BackupConfig(
        project_root=str(tmp_path),
        supabase_url="https://project.supabase.co",
        publishable_key="sb_publishable_test",
        owner_email=OWNER_EMAIL,
        python_path=str(tmp_path),
        node_path=str(tmp_path),
        artifact_node_modules=str(tmp_path),
    )


def library_fixture() -> dict:
    return {
        "members": [
            {"user_id": USER_ID, "email": OWNER_EMAIL, "display_name": "Nhihad"},
            {
                "user_id": "22222222-2222-4222-8222-222222222222",
                "email": "partner@example.com",
                "display_name": "Rachel",
            },
        ],
        "concerts": [
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "artist": "Kali Uchis",
                "tour": "Sincerely,",
                "date": "2025-09-17",
                "venue": "Scotiabank Arena",
                "price": 60.0,
                "genre": "Latin",
                "projected": 8.0,
                "seat": "Section 319",
                "status": "Attended",
                "type": "Concert",
                "spotify_url": None,
                "image": None,
                "notes": "Great show",
                "companions": "Rachel",
                "row_version": 2,
                "personal_rating": 8.5,
                "combined_rating": 8.7,
                "attendees": [
                    {
                        "user_id": USER_ID,
                        "display_name": "Nhihad",
                        "attendance_status": "Attended",
                        "row_version": 1,
                    }
                ],
                "reviews": [
                    {
                        "id": "44444444-4444-4444-8444-444444444444",
                        "reviewer_user_id": USER_ID,
                        "reviewer_name": "Nhihad",
                        "enjoyment_score": 9.0,
                        "stage_score": 8.0,
                        "setlist_score": 8.5,
                        "seat_score": 8.0,
                        "override_rating": None,
                        "override_reason": None,
                        "notes": None,
                        "calculated_rating": 8.5,
                        "final_rating": 8.5,
                        "is_overridden": False,
                        "row_version": 1,
                    }
                ],
            }
        ],
        "analytics": {
            "total_concerts": 1,
            "status_counts": {"Attended": 1},
            "date_first": "2025-09-17",
            "date_last": "2025-09-17",
            "spending": {
                "total_spent_excluding_cancelled": 60.0,
                "attended_spent": 60.0,
                "upcoming_committed": 0.0,
                "priced_concerts": 1,
                "average_attended_ticket": 60.0,
            },
            "rating_summaries": [{"scope": USER_ID, "rated_concerts": 1, "average_rating": 8.5}],
            "projection": {
                "compared_concerts": 1,
                "mean_absolute_error": 0.7,
                "root_mean_square_error": 0.7,
                "bias": 0.7,
                "within_one_point_percent": 100.0,
            },
            "yearly_trends": [
                {
                    "year": 2025,
                    "concerts": 1,
                    "attended": 1,
                    "total_spent": 60.0,
                    "average_combined_rating": 8.7,
                }
            ],
            "artist_summaries": [],
            "genre_summaries": [],
            "venue_summaries": [],
            "repeat_artists": [],
            "rankings": {
                USER_ID: [
                    {
                        "rank": 1,
                        "concert_id": "33333333-3333-4333-8333-333333333333",
                        "artist": "Kali Uchis",
                        "concert_date": "2025-09-17",
                        "rating": 8.5,
                    }
                ],
                "combined": [],
            },
        },
        "albums": [
            {
                "id": "aaaaaaaa-1111-4111-8111-111111111111",
                "spotify_album_id": "spotify-in-rainbows",
                "title": "In Rainbows",
                "artist": "Radiohead",
                "album_type": "album",
                "release_date": "2007-10-10",
                "release_date_precision": "day",
                "image_url": "https://example.com/in-rainbows.jpg",
                "spotify_url": "https://open.spotify.com/album/example",
                "label": "XL Recordings",
                "genres": ["alternative rock"],
                "total_tracks": 1,
                "duration_ms": 237000,
                "row_version": 1,
                "tracks": [
                    {
                        "id": "bbbbbbbb-1111-4111-8111-111111111111",
                        "spotify_track_id": "track-1",
                        "title": "15 Step",
                        "disc_number": 1,
                        "track_number": 1,
                        "duration_ms": 237000,
                        "explicit": False,
                        "spotify_url": None,
                    }
                ],
                "reviews": [
                    {
                        "id": "cccccccc-1111-4111-8111-111111111111",
                        "reviewer_user_id": USER_ID,
                        "reviewer_name": "Nhihad",
                        "overall_score": 9.2,
                        "review_markdown": "## Patient and vivid",
                        "status": "published",
                        "published_at": "2026-07-27T12:00:00Z",
                        "updated_at": "2026-07-27T12:00:00Z",
                        "row_version": 1,
                        "track_reviews": [
                            {
                                "id": "dddddddd-1111-4111-8111-111111111111",
                                "album_track_id": "bbbbbbbb-1111-4111-8111-111111111111",
                                "personal_rank": 1,
                                "score": 9.0,
                                "notes": "Perfect opener.",
                                "row_version": 1,
                            }
                        ],
                    }
                ],
            }
        ],
    }


def test_rest_client_uses_supabase_secret_key_over_publishable_when_present(
    tmp_path: Path,
) -> None:
    base = config(tmp_path)
    with_secret = BackupConfig(**{**base.__dict__, "supabase_secret_key": "sb_secret_test"})
    rest = _rest_client(with_secret)
    assert rest.headers["Authorization"] == "Bearer sb_secret_test"


def test_rest_client_falls_back_to_publishable_key_without_a_secret(tmp_path: Path) -> None:
    rest = _rest_client(config(tmp_path))
    assert rest.headers["Authorization"] == "Bearer sb_publishable_test"


def test_rest_client_builds_a_neon_client_when_configured(tmp_path: Path) -> None:
    base = config(tmp_path)
    neon_config = BackupConfig(
        **{
            **base.__dict__,
            "data_provider": "neon",
            "database_url": "postgresql://user:pass@host/db",
        }
    )
    rest = _rest_client(neon_config)
    assert type(rest).__name__ == "NeonRestClient"


def test_sqlite_backup_matches_snapshot_counts_and_checksums(tmp_path: Path) -> None:
    dataset = build_dataset(
        library_fixture(),
        fetched_at=datetime(2026, 7, 3, 6, 0, tzinfo=timezone.utc),
        source_url="https://project.supabase.co",
        owner_email=OWNER_EMAIL,
    )
    target = tmp_path / "concert_tracker.sqlite3"

    write_sqlite_atomic(dataset, target)
    verify_sqlite(target, dataset)

    with sqlite3.connect(target) as connection:
        assert connection.execute("select count(*) from concerts").fetchone()[0] == 1
        assert connection.execute("select artist from concerts").fetchone()[0] == "Kali Uchis"
        assert connection.execute("select count(*) from albums").fetchone()[0] == 1
        assert connection.execute("select title from album_tracks").fetchone()[0] == "15 Step"
        assert (
            connection.execute("select review_markdown from album_reviews").fetchone()[0]
            == "## Patient and vivid"
        )
        assert connection.execute("pragma integrity_check").fetchone()[0] == "ok"


def test_failed_sqlite_write_keeps_previous_copy(tmp_path: Path, monkeypatch) -> None:
    from sync import storage

    target = tmp_path / "concert_tracker.sqlite3"
    target.write_bytes(b"previous-backup")
    dataset = build_dataset(
        library_fixture(),
        fetched_at=datetime(2026, 7, 3, 6, 0, tzinfo=timezone.utc),
        source_url="https://project.supabase.co",
        owner_email=OWNER_EMAIL,
    )

    def fail_insert(*_args) -> None:
        raise RuntimeError("interrupted")

    monkeypatch.setattr(storage, "_insert_dataset", fail_insert)
    with pytest.raises(RuntimeError, match="interrupted"):
        storage.write_sqlite_atomic(dataset, target)
    assert target.read_bytes() == b"previous-backup"


def test_archive_retention_keeps_latest_thirty(tmp_path: Path) -> None:
    for index in range(32):
        (tmp_path / f"concerts-202607{index + 1:02d}T020000Z.xlsx").write_bytes(b"x")

    removed = prune_archives(tmp_path)

    assert len(removed) == 2
    assert len(list(tmp_path.glob("concerts-*.xlsx"))) == 30
    assert not (tmp_path / "concerts-20260701T020000Z.xlsx").exists()


def test_scheduled_run_catches_up_after_twenty_four_hours() -> None:
    now = datetime(2026, 7, 3, 12, 0, tzinfo=timezone.utc)
    assert not backup_is_due({"last_success_at": (now - timedelta(hours=23)).isoformat()}, now)
    assert backup_is_due({"last_success_at": (now - timedelta(hours=24)).isoformat()}, now)
    assert backup_is_due({}, now)


def test_launchd_runs_at_two_and_on_login(tmp_path: Path) -> None:
    plist = build_plist(config(tmp_path))

    assert plist["Label"] == LABEL
    assert plist["StartCalendarInterval"] == {"Hour": 2, "Minute": 0}
    assert plist["RunAtLoad"] is True
    assert plist["ProgramArguments"][-1] == "--scheduled"
    assert plist["WorkingDirectory"] == str(tmp_path)


def test_launchd_config_preserves_virtual_environment_entry_path(tmp_path: Path) -> None:
    venv_python = tmp_path / ".venv" / "bin" / "python"
    venv_python.parent.mkdir(parents=True)
    venv_python.symlink_to(Path("/usr/bin/python3"))

    assert configured_executable(venv_python).endswith("/.venv/bin/python")
    assert venv_python.resolve() == Path("/usr/bin/python3")
