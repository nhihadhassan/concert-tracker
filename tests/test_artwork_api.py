from uuid import UUID

import httpx
from fastapi.testclient import TestClient

from backend.identity import PublicUser, current_user
from backend.server import app


def client() -> TestClient:
    app.dependency_overrides[current_user] = lambda: PublicUser(
        user_id=UUID("11111111-1111-4111-8111-111111111111"),
        email="owner@example.com",
        display_name="Nhihad",
    )
    return TestClient(app)


def test_artwork_search_returns_unique_large_images(monkeypatch) -> None:
    def fake_get(*_args, **kwargs) -> httpx.Response:
        assert kwargs["params"]["term"] == "Kali Uchis Sincerely"
        request = httpx.Request("GET", "https://itunes.apple.com/search")
        return httpx.Response(
            200,
            request=request,
            json={
                "results": [
                    {
                        "artworkUrl100": "https://example.com/100x100bb.jpg",
                        "collectionName": "Sincerely",
                        "artistName": "Kali Uchis",
                        "collectionViewUrl": "https://music.apple.com/ca/album/example",
                    },
                    {
                        "artworkUrl100": "https://example.com/100x100bb.jpg",
                        "collectionName": "Duplicate",
                        "artistName": "Kali Uchis",
                    },
                ]
            },
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    artwork_client = client()
    try:
        response = artwork_client.get("/v1/artwork/search?q=Kali%20Uchis%20Sincerely")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "url": "https://example.com/600x600bb.jpg",
                "title": "Sincerely",
                "artist": "Kali Uchis",
                "store_url": "https://music.apple.com/ca/album/example",
            }
        ]
    }


def test_artwork_search_reports_upstream_failure(monkeypatch) -> None:
    def fake_get(*_args, **_kwargs) -> httpx.Response:
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "get", fake_get)
    artwork_client = client()
    try:
        response = artwork_client.get("/v1/artwork/search?q=Kali")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json()["detail"] == "Artwork search is temporarily unavailable"
