from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import discovery_routes
from backend.server import app
from backend.settings import Settings

SETLIST_PAYLOAD: dict[str, Any] = {
    "setlist": [
        {
            "eventDate": "17-09-2025",
            "url": "https://www.setlist.fm/setlist/yeat/2025/example.html",
            "artist": {"name": "Yeat"},
            "tour": {"name": "The Bell Tour"},
            "venue": {
                "name": "Scotiabank Arena",
                "city": {"name": "Toronto", "stateCode": "ON"},
            },
        },
        {
            # Same night, already captured: must be de-duplicated.
            "eventDate": "17-09-2025",
            "artist": {"name": "Yeat"},
            "venue": {"name": "scotiabank arena", "city": {"name": "Toronto"}},
        },
        {
            # No venue, so nothing worth prefilling.
            "eventDate": "01-01-2025",
            "artist": {"name": "Yeat"},
        },
    ]
}


def configure(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    settings = Settings(
        supabase_url="https://staging.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        setlistfm_api_key=key,
    )
    monkeypatch.setattr(discovery_routes, "get_settings", lambda: settings)


def test_setlists_become_prefill_suggestions(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, "setlistfm-test-key")
    captured: dict[str, Any] = {}

    def fake_get(url: str, **kwargs: Any) -> httpx.Response:
        captured["url"] = url
        captured["headers"] = kwargs["headers"]
        captured["params"] = kwargs["params"]
        return httpx.Response(
            200,
            json=SETLIST_PAYLOAD,
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(discovery_routes.httpx, "get", fake_get)
    response = TestClient(app).get("/v1/discovery/concerts?artist=Yeat")

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert captured["headers"]["x-api-key"] == "setlistfm-test-key"
    assert captured["params"]["artistName"] == "Yeat"

    assert len(body["results"]) == 1
    suggestion = body["results"][0]
    assert suggestion["artist"] == "Yeat"
    assert suggestion["tour"] == "The Bell Tour"
    # setlist.fm reports dd-MM-yyyy; the library stores ISO dates.
    assert suggestion["date"] == "2025-09-17"
    assert suggestion["venue"] == "Scotiabank Arena"
    assert suggestion["city"] == "Toronto, ON"


def test_missing_key_hides_the_feature(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, "")
    response = TestClient(app).get("/v1/discovery/concerts?artist=Yeat")

    assert response.status_code == 200
    assert response.json() == {"configured": False, "results": []}


def test_unmatched_search_is_empty_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, "setlistfm-test-key")

    def fake_get(url: str, **_kwargs: Any) -> httpx.Response:
        # setlist.fm answers an unmatched artist with 404.
        return httpx.Response(404, json={"code": 404}, request=httpx.Request("GET", url))

    monkeypatch.setattr(discovery_routes.httpx, "get", fake_get)
    response = TestClient(app).get("/v1/discovery/concerts?artist=Nobody")

    assert response.status_code == 200
    assert response.json() == {"configured": True, "results": []}


def test_upstream_failure_reports_bad_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, "setlistfm-test-key")

    def fake_get(url: str, **_kwargs: Any) -> httpx.Response:
        raise httpx.ConnectError("boom", request=httpx.Request("GET", url))

    monkeypatch.setattr(discovery_routes.httpx, "get", fake_get)
    response = TestClient(app).get("/v1/discovery/concerts?artist=Yeat")

    assert response.status_code == 502
