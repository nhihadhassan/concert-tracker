"""Upcoming-show lookup used to prefill the add-concert form.

Searches Ticketmaster's Discovery API for upcoming music events by artist in a
given city (Toronto by default) so the form can be populated with the real
date, venue, tour name, genre, and artwork instead of being typed by hand.
Requires a Ticketmaster API key; without one the endpoint reports
``configured=false`` so the UI hides the feature rather than erroring.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.settings import SettingsError, get_settings

router = APIRouter(prefix="/v1/discovery", tags=["discovery"])

TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
MAX_SUGGESTIONS = 8


class ConcertSuggestion(BaseModel):
    artist: str
    tour: Optional[str] = None
    date: str
    venue: str
    city: Optional[str] = None
    genre: Optional[str] = None
    image: Optional[str] = None
    ticket_url: Optional[str] = None


class SuggestionResponse(BaseModel):
    configured: bool
    results: list[ConcertSuggestion]


def _best_image(images: list[dict[str, Any]]) -> Optional[str]:
    """Pick the widest usable image, preferring non-cropped wide art."""
    usable = [image for image in images if isinstance(image.get("url"), str)]
    if not usable:
        return None
    preferred = [image for image in usable if image.get("ratio") in {"16_9", "3_2"}] or usable
    widest = max(preferred, key=lambda image: int(image.get("width") or 0))
    return str(widest["url"])


def _event_to_suggestion(event: dict[str, Any]) -> Optional[ConcertSuggestion]:
    embedded = event.get("_embedded") or {}
    venues = embedded.get("venues") or []
    if not venues:
        return None
    venue = venues[0] or {}
    venue_name = str(venue.get("name") or "").strip()

    start = (event.get("dates") or {}).get("start") or {}
    local_date = str(start.get("localDate") or "").strip()
    if not venue_name or not local_date:
        return None

    attractions = embedded.get("attractions") or []
    event_name = str(event.get("name") or "").strip()
    artist = str((attractions[0] or {}).get("name") or "").strip() if attractions else ""

    classifications = event.get("classifications") or []
    genre = None
    if classifications:
        genre_node = (classifications[0] or {}).get("genre") or {}
        genre_name = str(genre_node.get("name") or "").strip()
        # Ticketmaster uses "Undefined" as a placeholder genre.
        if genre_name and genre_name.lower() != "undefined":
            genre = genre_name

    # The event name usually carries the tour ("Yeat: The Bell Tour"); only keep
    # it as the tour when it adds something beyond the artist name itself.
    tour = event_name if event_name and event_name.lower() != artist.lower() else None

    return ConcertSuggestion(
        artist=artist or event_name,
        tour=tour,
        date=local_date,
        venue=venue_name,
        city=str((venue.get("city") or {}).get("name") or "").strip() or None,
        genre=genre,
        image=_best_image(event.get("images") or []),
        ticket_url=str(event.get("url") or "").strip() or None,
    )


@router.get("/concerts", response_model=SuggestionResponse)
def suggest_concerts(
    artist: str = Query(min_length=1, max_length=120),
    city: str = Query(default="Toronto", max_length=80),
) -> SuggestionResponse:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    if not settings.ticketmaster_api_key:
        return SuggestionResponse(configured=False, results=[])

    try:
        response = httpx.get(
            TICKETMASTER_EVENTS_URL,
            params={
                "apikey": settings.ticketmaster_api_key,
                "keyword": artist.strip(),
                "city": city.strip(),
                "countryCode": "CA",
                "classificationName": "Music",
                "sort": "date,asc",
                "size": 24,
            },
            timeout=10,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Concert search is temporarily unavailable",
        ) from exc

    events = (payload.get("_embedded") or {}).get("events") or []
    results: list[ConcertSuggestion] = []
    seen: set[tuple[str, str]] = set()
    for event in events:
        suggestion = _event_to_suggestion(event)
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
