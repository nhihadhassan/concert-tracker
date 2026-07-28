from __future__ import annotations

from typing import Any

from backend import album_routes
from tests.test_library_api import (
    MUTATION_ID,
    NHIHAD_ID,
    InMemoryRest,
    clear_overrides,
    client_for,
)

ALBUM_ID = "aaaaaaaa-1111-4111-8111-111111111111"
REVIEW_ID = "bbbbbbbb-2222-4222-8222-222222222222"
TRACK_REVIEW_ID = "cccccccc-3333-4333-8333-333333333333"


def spotify_album() -> dict[str, Any]:
    return {
        "id": "spotify-album-1",
        "name": "In Rainbows",
        "artists": [{"name": "Radiohead"}],
        "album_type": "album",
        "release_date": "2007-10-10",
        "release_date_precision": "day",
        "images": [{"url": "https://example.com/in-rainbows.jpg"}],
        "external_urls": {"spotify": "https://open.spotify.com/album/example"},
        "label": "XL Recordings",
        "genres": ["alternative rock"],
        "total_tracks": 2,
        "tracks": {
            "next": None,
            "items": [
                {
                    "id": "track-1",
                    "name": "15 Step",
                    "disc_number": 1,
                    "track_number": 1,
                    "duration_ms": 237000,
                    "explicit": False,
                    "external_urls": {"spotify": "https://open.spotify.com/track/1"},
                },
                {
                    "id": "track-2",
                    "name": "Bodysnatchers",
                    "disc_number": 1,
                    "track_number": 2,
                    "duration_ms": 242000,
                    "explicit": False,
                    "external_urls": {"spotify": "https://open.spotify.com/track/2"},
                },
            ],
        },
    }


def install_spotify_stubs(monkeypatch) -> None:
    monkeypatch.setattr(album_routes, "_settings", lambda: object())
    monkeypatch.setattr(album_routes, "_spotify_token", lambda client, settings: "token")
    monkeypatch.setattr(
        album_routes,
        "_spotify_get",
        lambda client, token, path, params=None: (
            {"albums": {"items": [spotify_album()]}} if path == "/search" else spotify_album()
        ),
    )


def import_album(client) -> None:
    response = client.post(
        "/v1/albums/import",
        headers={"Idempotency-Key": MUTATION_ID},
        json={"id": ALBUM_ID, "spotify_album_id": "spotify-album-1"},
    )
    assert response.status_code == 200, response.text


def test_album_library_starts_empty() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        response = client.get("/v1/albums")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json() == {"albums": []}


def test_spotify_album_search_returns_importable_results(monkeypatch) -> None:
    install_spotify_stubs(monkeypatch)
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        response = client.get("/v1/albums/search", params={"q": "in rainbows"})
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["results"][0] == {
        "spotify_album_id": "spotify-album-1",
        "title": "In Rainbows",
        "artist": "Radiohead",
        "release_date": "2007-10-10",
        "album_type": "album",
        "total_tracks": 2,
        "image_url": "https://example.com/in-rainbows.jpg",
        "spotify_url": "https://open.spotify.com/album/example",
    }


def test_import_is_duplicate_safe_and_preserves_track_order(monkeypatch) -> None:
    install_spotify_stubs(monkeypatch)
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        import_album(client)
        replay = client.post(
            "/v1/albums/import",
            headers={"Idempotency-Key": "dddddddd-4444-4444-8444-444444444444"},
            json={
                "id": "eeeeeeee-5555-4555-8555-555555555555",
                "spotify_album_id": "spotify-album-1",
            },
        )
        library = client.get("/v1/albums")
    finally:
        clear_overrides()

    album = library.json()["albums"][0]
    assert replay.status_code == 200
    assert replay.json()["replayed"] is True
    assert len(rest.data["albums"]) == 1
    assert [track["title"] for track in album["tracks"]] == ["15 Step", "Bodysnatchers"]
    assert album["duration_ms"] == 479000


def test_personal_album_review_keeps_original_order_and_optional_ranking(monkeypatch) -> None:
    install_spotify_stubs(monkeypatch)
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        import_album(client)
        track_ids = [row["id"] for row in rest.data["album_tracks"]]
        saved = client.put(
            f"/v1/albums/{ALBUM_ID}/review",
            headers={"Idempotency-Key": "ffffffff-6666-4666-8666-666666666666"},
            json={
                "id": REVIEW_ID,
                "overall_score": 9.2,
                "review_markdown": "## A patient, vivid record\n\nStill revealing details.",
                "status": "published",
                "track_reviews": [
                    {
                        "id": TRACK_REVIEW_ID,
                        "album_track_id": track_ids[0],
                        "personal_rank": 2,
                        "score": 9.0,
                        "notes": "Perfect opener.",
                    },
                    {
                        "id": "11111111-7777-4777-8777-777777777777",
                        "album_track_id": track_ids[1],
                        "personal_rank": 1,
                        "score": 9.5,
                        "notes": None,
                    },
                ],
            },
        )
        library = client.get("/v1/albums")
    finally:
        clear_overrides()

    album = library.json()["albums"][0]
    review = album["reviews"][0]
    assert saved.status_code == 200, saved.text
    assert review["reviewer_user_id"] == NHIHAD_ID
    assert review["status"] == "published"
    assert [track["track_number"] for track in album["tracks"]] == [1, 2]
    assert {row["personal_rank"] for row in review["track_reviews"]} == {1, 2}


def test_album_review_conflict_returns_current_version(monkeypatch) -> None:
    install_spotify_stubs(monkeypatch)
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        import_album(client)
        first = client.put(
            f"/v1/albums/{ALBUM_ID}/review",
            headers={"Idempotency-Key": "22222222-8888-4888-8888-888888888888"},
            json={
                "id": REVIEW_ID,
                "review_markdown": "First draft",
                "status": "draft",
                "track_reviews": [],
            },
        )
        stale = client.put(
            f"/v1/albums/{ALBUM_ID}/review",
            headers={"Idempotency-Key": "33333333-9999-4999-8999-999999999999"},
            json={
                "id": REVIEW_ID,
                "expected_row_version": 99,
                "review_markdown": "Stale draft",
                "status": "draft",
                "track_reviews": [],
            },
        )
    finally:
        clear_overrides()

    assert first.status_code == 200
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "row_version_conflict"
    assert stale.json()["detail"]["current"]["row_version"] == 1
