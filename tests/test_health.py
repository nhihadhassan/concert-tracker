from fastapi.testclient import TestClient

from backend.server import app

client = TestClient(app)


def test_health_contract() -> None:
    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "concert-tracker-api",
        "version": "0.3.0",
        "data_mode": "fixtures",
    }


def test_stage_five_exposes_only_reviewed_write_routes() -> None:
    write_routes = {
        (method, route.path)
        for route in app.routes
        for method in (getattr(route, "methods", None) or set())
        if method in {"POST", "PUT", "PATCH", "DELETE"}
    }

    assert write_routes == {
        ("DELETE", "/v1/concerts/{concert_id}"),
        ("POST", "/v1/analytics/calculate"),
        ("POST", "/v1/concerts"),
        ("POST", "/v1/ratings/calculate"),
        ("PATCH", "/v1/concerts/{concert_id}"),
        ("PUT", "/v1/concerts/{concert_id}/attendees"),
        ("PUT", "/v1/concerts/{concert_id}/review"),
    }
