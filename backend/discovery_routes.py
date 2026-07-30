"""Show lookup used to prefill the add-concert form.

Two modes, because they answer different questions and no single provider
covers both:

``upcoming``
    Shows an artist is about to play, for logging something you plan to
    attend. Ticketmaster is preferred (it operates most Toronto venues), with
    SeatGeek as a fallback when only that key is available.

``past``
    Shows an artist has already played, for backfilling a concert you attended
    but never logged. Served by setlist.fm, which is a setlist archive and so
    carries essentially no future dates.

Whichever provider answers, results share one ``ConcertSuggestion`` shape. With
no key for the requested mode the endpoint reports ``configured=false`` so the
UI hides the feature rather than erroring.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.settings import Settings, SettingsError, get_settings

router = APIRouter(prefix="/v1/discovery", tags=["discovery"])

TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
SEATGEEK_EVENTS_URL = "https://api.seatgeek.com/2/events"
SETLISTFM_SEARCH_URL = "https://api.setlist.fm/rest/1.0/search/setlists"
MAX_SUGGESTIONS = 8
PLACEHOLDER_GENRES = {"undefined", "other", "unknown"}
TORONTO = "Toronto"


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


class DiscoveryStatus(BaseModel):
    """Which search modes have a key, so the form can offer only what works."""

    upcoming: bool
    past: bool


@router.get("/status", response_model=DiscoveryStatus)
def discovery_status() -> DiscoveryStatus:
    try:
        settings = get_settings()
    except SettingsError:
        return DiscoveryStatus(upcoming=False, past=False)
    return DiscoveryStatus(
        upcoming=bool(settings.ticketmaster_api_key or settings.seatgeek_client_id),
        past=bool(settings.setlistfm_api_key),
    )


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


def _setlistfm_suggestion(entry: dict[str, Any]) -> Optional[ConcertSuggestion]:
    venue = entry.get("venue") or {}
    venue_name = str(venue.get("name") or "").strip()
    # setlist.fm dates are dd-MM-yyyy; the library stores ISO dates.
    raw_date = str(entry.get("eventDate") or "").strip()
    try:
        local_date = datetime.strptime(raw_date, "%d-%m-%Y").date().isoformat()
    except ValueError:
        return None
    if not venue_name:
        return None

    artist = str((entry.get("artist") or {}).get("name") or "").strip()
    city = (venue.get("city") or {}).get("name")

    return ConcertSuggestion(
        artist=artist,
        # setlist.fm has a real tour field, so no title heuristics needed here.
        tour=str((entry.get("tour") or {}).get("name") or "").strip() or None,
        date=local_date,
        venue=venue_name,
        city=str(city or "").strip() or None,
        # setlist.fm classifies neither genre nor artwork; both stay manual and
        # the form's existing iTunes lookup still fills artwork.
        genre=None,
        image=None,
        ticket_url=str(entry.get("url") or "").strip() or None,
    )


def _fetch(
    url: str,
    params: dict[str, Any],
    headers: Optional[dict[str, str]] = None,
    empty_on_404: bool = False,
) -> dict[str, Any]:
    try:
        response = httpx.get(
            url, params=params, headers=headers, timeout=10, follow_redirects=True
        )
        # setlist.fm answers an unmatched artist with 404 rather than an empty
        # list, so a typo should read as "nothing found", not as an outage.
        if empty_on_404 and response.status_code == 404:
            return {}
        # setlist.fm rate-limits tightly; say so instead of blaming the network.
        if response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many searches at once. Wait a moment and try again.",
            )
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


def _search_setlistfm(settings: Settings, artist: str, city: str) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"artistName": artist}
    # City is an opt-in filter here: past shows are worth finding wherever they
    # happened, including ones travelled for.
    if city:
        params["cityName"] = city
    payload = _fetch(
        SETLISTFM_SEARCH_URL,
        params,
        headers={"x-api-key": settings.setlistfm_api_key, "Accept": "application/json"},
        empty_on_404=True,
    )
    return payload.get("setlist") or []


@router.get("/concerts", response_model=SuggestionResponse)
def suggest_concerts(
    artist: str = Query(min_length=1, max_length=120),
    mode: str = Query(default="upcoming", pattern="^(upcoming|past)$"),
    # Kept as an optional query parameter for backwards-compatible clients,
    # but discovery is intentionally Toronto-only for this app.
    city: Optional[str] = Query(default=None, max_length=80),
) -> SuggestionResponse:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    artist_query = artist.strip()
    # The tracker is for Toronto shows. Never let a provider's broader fallback
    # results (or a caller-supplied city) leak other cities into the form.
    city_query = TORONTO

    if mode == "past":
        if not settings.setlistfm_api_key:
            return SuggestionResponse(configured=False, results=[], provider=None)
        provider = "setlistfm"
        events = _search_setlistfm(settings, artist_query, city_query)
        to_suggestion = _setlistfm_suggestion
    elif settings.ticketmaster_api_key:
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
        if (suggestion.city or "").strip().casefold() != TORONTO.casefold():
            continue
        key = (suggestion.date, suggestion.venue.lower())
        if key in seen:
            continue
        seen.add(key)
        results.append(suggestion)
        if len(results) == MAX_SUGGESTIONS:
            break

    return SuggestionResponse(configured=True, results=results, provider=provider)
