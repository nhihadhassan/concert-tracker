"""Upcoming-show lookup used to prefill the add-concert form.

Searches for upcoming music events by artist in a given city (Toronto by
default) so the form can be populated with the real date, venue, tour name,
genre, and artwork instead of being typed by hand.

Two providers are supported so the feature is not hostage to one signup flow:
Ticketmaster is preferred (it operates most Toronto venues), and SeatGeek is
used when only that key is available. With neither key the endpoint reports
``configured=false`` so the UI hides the feature rather than erroring.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.settings import Settings, SettingsError, get_settings

router = APIRouter(prefix="/v1/discovery", tags=["discovery"])

TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
SEATGEEK_EVENTS_URL = "https://api.seatgeek.com/2/events"
MAX_SUGGESTIONS = 8
PLACEHOLDER_GENRES = {"undefined", "other", "unknown"}


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
    provider: Optional[str] = None


def _clean_genre(value: Any) -> Optional[str]:
    name = str(value or "").strip()
    if not name or name.lower() in PLACEHOLDER_GENRES:
        return None
    return name


def _tour_name(event_name: str, artist: str) -> Optional[str]:
    """Keep the event title as the tour only when it adds something.

    Listings are often titled just the artist name, which would make a useless
    tour value ("Yeat" playing the "Yeat" tour).
    """
    name = event_name.strip()
    if not name or name.lower() == artist.strip().lower():
        return None
    return name


def _best_image(images: list[dict[str, Any]]) -> Optional[str]:
    """Pick the widest usable image, preferring non-cropped wide art."""
    usable = [image for image in images if isinstance(image.get("url"), str)]
    if not usable:
        return None
    preferred = [image for image in usable if image.get("ratio") in {"16_9", "3_2"}] or usable
    widest = max(preferred, key=lambda image: int(image.get("width") or 0))
    return str(widest["url"])


def _ticketmaster_suggestion(event: dict[str, Any]) -> Optional[ConcertSuggestion]:
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
        genre = _clean_genre(((classifications[0] or {}).get("genre") or {}).get("name"))

    return ConcertSuggestion(
        artist=artist or event_name,
        tour=_tour_name(event_name, artist),
        date=local_date,
        venue=venue_name,
        city=str((venue.get("city") or {}).get("name") or "").strip() or None,
        genre=genre,
        image=_best_image(event.get("images") or []),
        ticket_url=str(event.get("url") or "").strip() or None,
    )


def _seatgeek_suggestion(event: dict[str, Any]) -> Optional[ConcertSuggestion]:
    venue = event.get("venue") or {}
    venue_name = str(venue.get("name") or "").strip()
    # SeatGeek returns an ISO local datetime; the form only stores the date.
    local_date = str(event.get("datetime_local") or "")[:10].strip()
    if not venue_name or len(local_date) != 10:
        return None

    performers = event.get("performers") or []
    primary = (performers[0] or {}) if performers else {}
    artist = str(primary.get("name") or "").strip()
    event_name = str(event.get("title") or "").strip()

    genres = primary.get("genres") or []
    genre = _clean_genre((genres[0] or {}).get("name")) if genres else None

    return ConcertSuggestion(
        artist=artist or event_name,
        tour=_tour_name(event_name, artist),
        date=local_date,
        venue=venue_name,
        city=str(venue.get("city") or "").strip() or None,
        genre=genre,
        image=str(primary.get("image") or "").strip() or None,
        ticket_url=str(event.get("url") or "").strip() or None,
    )


def _fetch(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = httpx.get(url, params=params, timeout=10, follow_redirects=True)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        return payload
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Concert search is temporarily unavailable",
        ) from exc


def _search_ticketmaster(settings: Settings, artist: str, city: str) -> list[dict[str, Any]]:
    payload = _fetch(
        TICKETMASTER_EVENTS_URL,
        {
            "apikey": settings.ticketmaster_api_key,
            "keyword": artist,
            "city": city,
            "countryCode": "CA",
            "classificationName": "Music",
            "sort": "date,asc",
            "size": 24,
        },
    )
    return (payload.get("_embedded") or {}).get("events") or []


def _search_seatgeek(settings: Settings, artist: str, city: str) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "client_id": settings.seatgeek_client_id,
        "q": artist,
        "venue.city": city,
        "taxonomies.name": "concert",
        "sort": "datetime_local.asc",
        "per_page": 24,
    }
    if settings.seatgeek_client_secret:
        params["client_secret"] = settings.seatgeek_client_secret
    payload = _fetch(SEATGEEK_EVENTS_URL, params)
    return payload.get("events") or []


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

    artist_query = artist.strip()
    city_query = city.strip()
    if settings.ticketmaster_api_key:
        provider = "ticketmaster"
        events = _search_ticketmaster(settings, artist_query, city_query)
        to_suggestion = _ticketmaster_suggestion
    elif settings.seatgeek_client_id:
        provider = "seatgeek"
        events = _search_seatgeek(settings, artist_query, city_query)
        to_suggestion = _seatgeek_suggestion
    else:
        return SuggestionResponse(configured=False, results=[], provider=None)

    results: list[ConcertSuggestion] = []
    seen: set[tuple[str, str]] = set()
    for event in events:
        suggestion = to_suggestion(event)
        if suggestion is None:
            continue
        key = (suggestion.date, suggestion.venue.lower())
        if key in seen:
            continue
        seen.add(key)
        results.append(suggestion)
        if len(results) == MAX_SUGGESTIONS:
            break

    return SuggestionResponse(configured=True, results=results, provider=provider)
