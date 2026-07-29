"""Genius-powered lyric breakdown.

Returns one crowd-sourced annotation (Genius' line-by-line explanation) for a
song by a given artist, used on the stats page as a "lyric breakdown" tied to
the member's next show or top artist. Requires a Genius API access token; when
that is not configured the endpoint reports ``configured=false`` so the UI can
stay quiet rather than error.
"""

from __future__ import annotations

import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.settings import SettingsError, get_settings

router = APIRouter(prefix="/v1/lyrics", tags=["lyrics"])

GENIUS_API_BASE = "https://api.genius.com"
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
MIN_ANNOTATION_CHARS = 60


class BreakdownResponse(BaseModel):
    configured: bool
    found: bool
    song: Optional[str] = None
    artist: Optional[str] = None
    image: Optional[str] = None
    url: Optional[str] = None
    fragment: Optional[str] = None
    annotation: Optional[str] = None
    annotation_url: Optional[str] = None


def _normalize(value: str) -> str:
    return _NON_ALNUM.sub(" ", value.lower()).strip()


def _genius_get(
    client: httpx.Client, token: str, path: str, params: dict[str, Any]
) -> dict[str, Any]:
    response = client.get(
        f"{GENIUS_API_BASE}{path}",
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json().get("response", {})


def _pick_hit(hits: list[dict[str, Any]], artist: str) -> Optional[dict[str, Any]]:
    wanted = _normalize(artist)
    for hit in hits:
        result = hit.get("result", {})
        primary = _normalize((result.get("primary_artist") or {}).get("name", ""))
        if wanted and primary and (wanted in primary or primary in wanted):
            return result
    return hits[0].get("result") if hits else None


def _best_annotation(referents: list[dict[str, Any]]) -> Optional[tuple[str, str, str]]:
    best: Optional[tuple[int, str, str, str]] = None
    for referent in referents:
        fragment = str(referent.get("fragment", "")).strip()
        for annotation in referent.get("annotations", []):
            body = ((annotation.get("body") or {}).get("plain") or "").strip()
            if len(body) < MIN_ANNOTATION_CHARS:
                continue
            votes = int(annotation.get("votes_total", 0) or 0)
            if best is None or votes > best[0]:
                best = (votes, fragment, body, str(annotation.get("url", "")))
    if best is None:
        return None
    return best[1], best[2], best[3]


@router.get("/breakdown", response_model=BreakdownResponse)
def lyric_breakdown(
    artist: str = Query(min_length=1, max_length=160),
    track: Optional[str] = Query(default=None, max_length=160),
) -> BreakdownResponse:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    if not settings.genius_access_token:
        return BreakdownResponse(configured=False, found=False)

    query = f"{track} {artist}".strip() if track else artist.strip()
    try:
        with httpx.Client() as client:
            search = _genius_get(client, settings.genius_access_token, "/search", {"q": query})
            hit = _pick_hit(search.get("hits", []), artist)
            if hit is None:
                return BreakdownResponse(configured=True, found=False)
            referents = _genius_get(
                client,
                settings.genius_access_token,
                "/referents",
                {"song_id": hit.get("id"), "text_format": "plain", "per_page": 30},
            )
            annotation = _best_annotation(referents.get("referents", []))
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Genius lookup is temporarily unavailable",
        ) from exc

    song = str(hit.get("title") or hit.get("full_title") or "")
    primary_artist = str((hit.get("primary_artist") or {}).get("name", artist))
    image = hit.get("song_art_image_url") or hit.get("header_image_thumbnail_url")
    if annotation is None:
        return BreakdownResponse(
            configured=True,
            found=False,
            song=song,
            artist=primary_artist,
            image=image,
            url=hit.get("url"),
        )
    fragment, body, annotation_url = annotation
    return BreakdownResponse(
        configured=True,
        found=True,
        song=song,
        artist=primary_artist,
        image=image,
        url=hit.get("url"),
        fragment=fragment,
        annotation=body,
        annotation_url=annotation_url,
    )
