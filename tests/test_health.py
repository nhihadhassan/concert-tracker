from fastapi.testclient import TestClient

from backend.server import app

client = TestClient(app)


def test_health_contract() -> None:
    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "concert-tracker-api",
        "version": "0.1.0",
        "data_mode": "fixtures",
    }


def test_no_stage_one_write_routes() -> None:
    write_methods = {"POST", "PUT", "PATCH", "DELETE"}
    methods = {
        method
        for route in app.routes
        for method in (getattr(route, "methods", None) or set())
        if method in write_methods
    }

    assert methods == set()
