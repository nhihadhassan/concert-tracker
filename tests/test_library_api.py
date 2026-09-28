from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import UUID

from fastapi.testclient import TestClient

from backend.identity import PublicUser, current_user
from backend.server import app
from backend.supabase_rest import get_rest_client

NHIHAD_ID = "11111111-1111-4111-8111-111111111111"
RACHEL_ID = "22222222-2222-4222-8222-222222222222"
CONCERT_ID = "33333333-3333-4333-8333-333333333333"
REVIEW_ID = "44444444-4444-4444-8444-444444444444"
MUTATION_ID = "55555555-5555-4555-8555-555555555555"


class InMemoryRest:
    def __init__(self) -> None:
        self.data: dict[str, list[dict[str, Any]]] = {
            "app_members": [
                {
                    "user_id": NHIHAD_ID,
                    "email": "owner@example.com",
                    "display_name": "Nhihad",
                    "is_active": True,
                    "deleted_at": None,
                },
                {
                    "user_id": RACHEL_ID,
                    "email": "partner@example.com",
                    "display_name": "Rachel",
                    "is_active": True,
                    "deleted_at": None,
                },
            ],
            "rating_rule_versions": [{"id": "66666666-6666-4666-8666-666666666666", "version": 1}],
            "concerts": [],
            "concert_attendees": [],
            "concert_reviews": [],
            "albums": [],
            "album_tracks": [],
            "album_reviews": [],
            "album_track_reviews": [],
            "api_idempotency_keys": [],
        }

    @staticmethod
    def _matches(row: dict[str, Any], params: dict[str, Any] | None) -> bool:
        for key, raw in (params or {}).items():
            if key in {"select", "order", "limit"}:
                continue
            value = str(raw)
            if value.startswith("eq."):
                actual = (
                    str(row.get(key)).lower()
                    if isinstance(row.get(key), bool)
                    else str(row.get(key))
                )
                if actual != value[3:].lower():
                    return False
            if value == "is.null" and row.get(key) is not None:
                return False
        return True

    def select(
        self, resource: str, *, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        rows = [deepcopy(row) for row in self.data[resource] if self._matches(row, params)]
        limit = int(params.get("limit", len(rows))) if params else len(rows)
        return rows[:limit]

    def insert(
        self,
        resource: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        del params
        payloads = payload if isinstance(payload, list) else [payload]
        inserted = []
        for value in payloads:
            row = {
                "row_version": 1,
                "deleted_at": None,
                "created_at": "2026-07-01T00:00:00Z",
                "updated_at": "2026-07-01T00:00:00Z",
                **deepcopy(value),
            }
            self.data[resource].append(row)
            inserted.append(deepcopy(row))
        return inserted

    def update(
        self,
        resource: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any],
        return_rows: bool = True,
    ) -> list[dict[str, Any]]:
        changed = []
        for row in self.data[resource]:
            if not self._matches(row, params):
                continue
            row.update(deepcopy(payload))
            row["row_version"] = int(row["row_version"]) + 1
            changed.append(deepcopy(row))
        return changed if return_rows else []

    def update_count(
        self,
        resource: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any],
    ) -> int:
        before = [row for row in self.data[resource] if self._matches(row, params)]
        self.update(resource, payload, params=params, return_rows=False)
        return len(before)


def client_for(rest: InMemoryRest) -> TestClient:
    app.dependency_overrides[current_user] = lambda: PublicUser(
        user_id=UUID(NHIHAD_ID),
        email="owner@example.com",
        display_name="Nhihad",
    )
    app.dependency_overrides[get_rest_client] = lambda: rest
    return TestClient(app)


def clear_overrides() -> None:
    app.dependency_overrides.clear()


def concert_payload() -> dict[str, Any]:
    return {
        "id": CONCERT_ID,
        "artist": "Little Simz",
        "tour": "Lotus Tour",
        "date": "2026-09-12",
        "venue": "History",
        "price": 85,
        "genre": "Hip-Hop",
        "projected": 9,
        "seat": "Floor",
        "status": "Want to Go",
        "type": "Concert",
        "spotify_url": "https://open.spotify.com/playlist/example",
        "image": "https://example.com/art.jpg",
        "notes": "First staging concert",
        "companions": "Rachel",
        "attendee_user_ids": [NHIHAD_ID, RACHEL_ID],
        "review": None,
    }


def create_concert(client: TestClient) -> None:
    response = client.post(
        "/v1/concerts",
        headers={"Idempotency-Key": MUTATION_ID},
        json=concert_payload(),
    )
    assert response.status_code == 200


def test_library_starts_empty_with_typed_analytics() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        response = client.get("/v1/library")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["concerts"] == []
    assert len(response.json()["members"]) == 2
    assert response.json()["analytics"]["total_concerts"] == 0
    assert response.json()["personal_analytics"]["total_concerts"] == 0
    assert response.json()["analytics"]["monthly_trends"] == []
    assert response.json()["analytics"]["most_attended_weekday"] is None


def test_create_is_idempotent_and_returns_cloud_library() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        create_concert(client)
        replay = client.post(
            "/v1/concerts",
            headers={"Idempotency-Key": MUTATION_ID},
            json=concert_payload(),
        )
        library = client.get("/v1/library")
    finally:
        clear_overrides()

    assert replay.status_code == 200
    assert replay.json()["replayed"] is True
    assert len(rest.data["concerts"]) == 1
    assert len(rest.data["concert_attendees"]) == 2
    assert library.json()["concerts"][0]["artist"] == "Little Simz"


def test_library_returns_shared_and_current_member_analytics() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        create_concert(client)
        shared_only_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        shared_only = deepcopy(rest.data["concerts"][0])
        shared_only.update(
            {
                "id": shared_only_id,
                "artist": "Rachel Only",
                "concert_date": "2026-10-05",
                "status": "Attended",
            }
        )
        rest.data["concerts"].append(shared_only)
        attendee = deepcopy(
            next(row for row in rest.data["concert_attendees"] if row["user_id"] == RACHEL_ID)
        )
        attendee.update(
            {
                "concert_id": shared_only_id,
                "attendance_status": "Attended",
            }
        )
        rest.data["concert_attendees"].append(attendee)

        library = client.get("/v1/library")
    finally:
        clear_overrides()

    body = library.json()
    assert body["analytics"]["total_concerts"] == 2
    assert body["personal_analytics"]["total_concerts"] == 1
    assert body["analytics"]["status_counts"] == {"Want to Go": 1, "Attended": 1}
    assert body["personal_analytics"]["status_counts"] == {"Want to Go": 1}
    assert body["analytics"]["monthly_trends"] == [
        {"year": 2026, "month": 9, "concerts": 1, "attended": 0},
        {"year": 2026, "month": 10, "concerts": 1, "attended": 1},
    ]


def test_stale_update_returns_conflict_with_current_row() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        create_concert(client)
        payload = concert_payload() | {"expected_row_version": 99}
        payload.pop("id")
        payload.pop("attendee_user_ids")
        payload.pop("review")
        response = client.patch(
            f"/v1/concerts/{CONCERT_ID}",
            headers={"Idempotency-Key": "77777777-7777-4777-8777-777777777777"},
            json=payload,
        )
    finally:
        clear_overrides()

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "row_version_conflict"
    assert response.json()["detail"]["current"]["row_version"] == 1


def test_review_and_attendance_updates_keep_personal_scores_separate() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        create_concert(client)
        review = client.put(
            f"/v1/concerts/{CONCERT_ID}/review",
            headers={"Idempotency-Key": "88888888-8888-4888-8888-888888888888"},
            json={
                "id": REVIEW_ID,
                "enjoyment_score": 10,
                "stage_score": 8,
                "setlist_score": 8,
                "seat_score": 8,
            },
        )
        attendance = client.put(
            f"/v1/concerts/{CONCERT_ID}/attendees",
            headers={"Idempotency-Key": "99999999-9999-4999-8999-999999999999"},
            json={
                "attendee_user_ids": [NHIHAD_ID],
                "expected_versions": {NHIHAD_ID: 1, RACHEL_ID: 1},
            },
        )
        library = client.get("/v1/library")
    finally:
        clear_overrides()

    concert = library.json()["concerts"][0]
    assert review.status_code == 200
    assert attendance.status_code == 200
    assert concert["personal_rating"] == 9.3
    assert concert["combined_rating"] == 9.3
    rachel = next(row for row in concert["attendees"] if row["user_id"] == RACHEL_ID)
    assert rachel["attendance_status"] == "Did Not Attend"


def test_csv_and_soft_delete_use_cloud_state() -> None:
    rest = InMemoryRest()
    client = client_for(rest)
    try:
        create_concert(client)
        csv_response = client.get("/v1/concerts/export.csv")
        deleted = client.delete(
            f"/v1/concerts/{CONCERT_ID}",
            params={"expected_row_version": 1},
            headers={"Idempotency-Key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
        )
        library = client.get("/v1/library")
    finally:
        clear_overrides()

    assert csv_response.status_code == 200
    assert "Little Simz" in csv_response.text
    assert deleted.status_code == 200
    assert library.json()["concerts"] == []
