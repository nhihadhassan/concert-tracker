from uuid import UUID

from fastapi.testclient import TestClient

from backend.identity import PublicUser, current_user
from backend.server import app


def authenticated_client() -> TestClient:
    app.dependency_overrides[current_user] = lambda: PublicUser(
        user_id=UUID("11111111-1111-4111-8111-111111111111"),
        email="owner@example.com",
        display_name="Nhihad",
    )
    return TestClient(app)


def clear_auth_override() -> None:
    app.dependency_overrides.clear()


def test_current_rule_contract() -> None:
    client = authenticated_client()
    try:
        response = client.get("/v1/rating-rules/current")
    finally:
        clear_auth_override()

    assert response.status_code == 200
    assert response.json()["version"] == 1
    assert response.json()["weights"]["enjoyment"] == 0.5
    assert round(response.json()["weights"]["stage"], 6) == 0.166667


def test_rating_endpoint_returns_personal_calculated_override_and_combined_values() -> None:
    client = authenticated_client()
    try:
        response = client.post(
            "/v1/ratings/calculate",
            json={
                "reviews": [
                    {
                        "reviewer_user_id": "nhihad",
                        "reviewer_name": "Nhihad",
                        "enjoyment_score": 10,
                        "stage_score": 8,
                        "setlist_score": 8,
                        "seat_score": 8,
                    },
                    {
                        "reviewer_user_id": "rachel",
                        "reviewer_name": "Rachel",
                        "override_rating": 9.5,
                        "override_reason": "Imported legacy score",
                    },
                ]
            },
        )
    finally:
        clear_auth_override()

    body = response.json()
    assert response.status_code == 200
    assert body["reviews"][0]["calculated_rating"] == 9.0
    assert body["reviews"][0]["final_rating"] == 9.0
    assert body["reviews"][1]["calculated_rating"] is None
    assert body["reviews"][1]["override_rating"] == 9.5
    assert body["reviews"][1]["final_rating"] == 9.5
    assert body["combined_rating"] == 9.3


def test_rating_endpoint_rejects_undocumented_and_duplicate_overrides() -> None:
    client = authenticated_client()
    try:
        missing_reason = client.post(
            "/v1/ratings/calculate",
            json={"reviews": [{"reviewer_user_id": "nhihad", "override_rating": 9}]},
        )
        duplicate = client.post(
            "/v1/ratings/calculate",
            json={
                "reviews": [
                    {"reviewer_user_id": "nhihad", "enjoyment_score": 8},
                    {"reviewer_user_id": "nhihad", "enjoyment_score": 9},
                ]
            },
        )
    finally:
        clear_auth_override()

    assert missing_reason.status_code == 422
    assert "override_reason" in missing_reason.json()["detail"]
    assert duplicate.status_code == 422
    assert "must be unique" in duplicate.json()["detail"]


def test_calculation_endpoints_reject_client_defined_rules() -> None:
    client = authenticated_client()
    try:
        response = client.post(
            "/v1/ratings/calculate",
            json={"reviews": [], "rule": {"enjoyment_weight": 1}},
        )
    finally:
        clear_auth_override()

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "extra_forbidden"


def test_analytics_endpoint_calculates_ratings_before_analytics() -> None:
    client = authenticated_client()
    try:
        response = client.post(
            "/v1/analytics/calculate",
            json={
                "concerts": [
                    {
                        "concert_id": "a",
                        "artist": "Don Toliver 2023",
                        "concert_date": "2023-06-22",
                        "venue": "Scotiabank Arena",
                        "status": "Attended",
                        "price": 100,
                        "genre": "Hip-Hop",
                        "projected_rating": 8,
                        "reviews": [
                            {
                                "reviewer_user_id": "nhihad",
                                "enjoyment_score": 9.4,
                                "stage_score": 8,
                                "setlist_score": 8,
                                "seat_score": 7,
                            }
                        ],
                    },
                    {
                        "concert_id": "b",
                        "artist": "Don Toliver 2024",
                        "concert_date": "2024-11-14",
                        "venue": "Scotiabank Arena (40 Bay St.)",
                        "status": "Attended",
                        "price": 150,
                        "genre": "Hip-Hop",
                        "projected_rating": 9,
                        "reviews": [
                            {
                                "reviewer_user_id": "rachel",
                                "override_rating": 9.5,
                                "override_reason": "Legacy score",
                            }
                        ],
                    },
                ]
            },
        )
    finally:
        clear_auth_override()

    body = response.json()
    assert response.status_code == 200
    assert body["concert_ratings"][0]["combined_rating"] == 8.5
    assert body["concert_ratings"][1]["combined_rating"] == 9.5
    assert body["analytics"]["spending"]["attended_spent"] == 250.0
    assert body["analytics"]["repeat_artists"][0]["key"] == "Don Toliver"
    assert body["analytics"]["rankings"]["combined"][0]["concert_id"] == "b"
