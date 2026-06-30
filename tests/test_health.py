from fastapi.testclient import TestClient

from backend.server import app

client = TestClient(app)


def test_health_contract() -> None:
    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "concert-tracker-api",
        "version": "0.2.0",
        "data_mode": "fixtures",
    }


def test_stage_three_has_calculation_posts_but_no_persistence_write_routes() -> None:
    write_routes = {
        (method, route.path)
        for route in app.routes
        for method in (getattr(route, "methods", None) or set())
        if method in {"POST", "PUT", "PATCH", "DELETE"}
    }

    assert write_routes == {
        ("POST", "/v1/analytics/calculate"),
        ("POST", "/v1/ratings/calculate"),
    }
