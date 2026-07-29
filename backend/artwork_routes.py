import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel


class ArtworkOption(BaseModel):
    url: str
    title: str
    artist: str
    store_url: Optional[str] = None


class ArtworkSearchResponse(BaseModel):
    results: list[ArtworkOption]


router = APIRouter(prefix="/v1", tags=["artwork"])


def _large_artwork_url(url: str) -> str:
    return re.sub(r"\d+x\d+bb", "600x600bb", url)


@router.get("/artwork/search", response_model=ArtworkSearchResponse)
def search_artwork(
    q: str = Query(min_length=1, max_length=120),
) -> ArtworkSearchResponse:
    try:
        response = httpx.get(
            "https://itunes.apple.com/search",
            params={"term": q.strip(), "entity": "album", "limit": 24, "country": "ca"},
            timeout=8,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Artwork search is temporarily unavailable",
        ) from exc

    options: list[ArtworkOption] = []
    seen: set[str] = set()
    for item in payload.get("results", []):
        raw_url = item.get("artworkUrl100")
        if not isinstance(raw_url, str) or not raw_url:
            continue
        url = _large_artwork_url(raw_url)
        if url in seen:
            continue
        seen.add(url)
        options.append(
            ArtworkOption(
                url=url,
                title=str(item.get("collectionName") or "Album artwork"),
                artist=str(item.get("artistName") or ""),
                store_url=item.get("collectionViewUrl"),
            )
        )
        if len(options) == 12:
            break

    return ArtworkSearchResponse(results=options)
