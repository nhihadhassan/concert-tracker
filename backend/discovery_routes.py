"""Show lookup used to prefill the add-concert form.

Searches setlist.fm for concerts an artist has played so the form can be
populated with the real date, venue, city, and tour name instead of being typed
from memory. setlist.fm is built from setlists of shows that already happened,
which is what a concert tracker is mostly recording; it carries no artwork, so
the form falls back to its existing iTunes artwork lookup after a pick.

Requires a setlist.fm API key; without one the endpoint reports
``configured=false`` so the UI hides the feature rather than erroring.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.settings import SettingsError, get_settings

router = APIRouter(prefix="/v1/discovery", tags=["discovery"])

SETLISTFM_SEARCH_URL = "https://api.setlist.fm/rest/1.0/search/setlists"
MAX_SUGGESTIONS = 8


class ConcertSuggestion(BaseModel):
    artist: str
    tour: Optional[str] = None
    date: str
    venue: str
    city: Optional[str] = None
    genre: Optional[str] = None
    image: Optional[str] = None
    source_url: Optional[str] = None


class SuggestionResponse(BaseModel):
    configured: bool
    results: list[ConcertSuggestion]


def _iso_date(event_date: str) -> Optional[str]:
    """setlist.fm reports dates as dd-MM-yyyy; the library stores yyyy-MM-dd."""
    try:
        return datetime.strptime(event_date, "%d-%m-%Y").date().isoformat()
    except ValueError:
        return None


def _setlist_to_suggestion(setlist: dict[str, Any]) -> Optional[ConcertSuggestion]:
    venue = setlist.get("venue") or {}
    venue_name = str(venue.get("name") or "").strip()
    date = _iso_date(str(setlist.get("eventDate") or "").strip())
    if not venue_name or not date:
        return None

    city_node = venue.get("city") or {}
    city_name = str(city_node.get("name") or "").strip()
    state = str(city_node.get("stateCode") or "").strip()
    city = f"{city_name}, {state}" if city_name and state else city_name or None

    tour_name = str((setlist.get("tour") or {}).get("name") or "").strip()

    return ConcertSuggestion(
        artist=str((setlist.get("artist") or {}).get("name") or "").strip(),
        tour=tour_name or None,
        date=date,
        venue=venue_name,
        city=city,
        # setlist.fm classifies neither genre nor artwork; both are left for the
        # existing artwork search and manual entry to fill in.
        genre=None,
        image=None,
        source_url=str(setlist.get("url") or "").strip() or None,
    )


@router.get("/concerts", response_model=SuggestionResponse)
def suggest_concerts(
    artist: str = Query(min_length=1, max_length=120),
    city: Optional[str] = Query(default=None, max_length=80),
) -> SuggestionResponse:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    if not settings.setlistfm_api_key:
        return SuggestionResponse(configured=False, results=[])

    params: dict[str, Any] = {"artistName": artist.strip(), "p": 1}
    if city and city.strip():
        params["cityName"] = city.strip()

    try:
        response = httpx.get(
            SETLISTFM_SEARCH_URL,
            params=params,
            headers={
                "x-api-key": settings.setlistfm_api_key,
                "Accept": "application/json",
            },
            timeout=10,
            follow_redirects=True,
        )
        # setlist.fm answers an unmatched search with 404 rather than an empty
        # list, which is a normal "nothing found" and not a failure.
        if response.status_code == status.HTTP_404_NOT_FOUND:
            return SuggestionResponse(configured=True, results=[])
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Concert search is temporarily unavailable",
        ) from exc

    results: list[ConcertSuggestion] = []
    seen: set[tuple[str, str]] = set()
    for setlist in payload.get("setlist") or []:
        suggestion = _setlist_to_suggestion(setlist)
        if suggestion is None:
            continue
        key = (suggestion.date, suggestion.venue.lower())
        if key in seen:
            continue
        seen.add(key)
        results.append(suggestion)
        if len(results) == MAX_SUGGESTIONS:
            break

    return SuggestionResponse(configured=True, results=results)
