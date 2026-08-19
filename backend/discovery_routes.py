"""Show lookup used to prefill the add-concert form.

Two modes, because they answer different questions and no single provider
covers both:

``upcoming``
    Shows an artist is about to play, for logging something you plan to
    attend. Ticketmaster is the live provider (search radius: 50km around
    Toronto, so Hamilton/Mississauga/Oshawa/Burlington shows are included);
    SeatGeek and Gemini's grounded Google Search remain as fallbacks for
    whenever those keys are configured instead.

``past``
    Shows an artist has already played, for backfilling a concert you attended
    but never logged. Served by setlist.fm, which is a setlist archive and so
    carries essentially no future dates. Ticketmaster cannot substitute here
    -- its events endpoint does not index past events at all.

Whichever provider answers, results share one ``ConcertSuggestion`` shape. With
no key for the requested mode the endpoint reports ``configured=false`` so the
UI hides the feature rather than erroring.
"""

# Encore's Python 3.9 test floor cannot evaluate PEP 604 unions in Pydantic models.
# ruff: noqa: UP045

from __future__ import annotations

import json
import math
import re
import unicodedata
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, NamedTuple, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from backend.settings import Settings, SettingsError, get_settings

router = APIRouter(prefix="/v1/discovery", tags=["discovery"])

TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
TICKETMASTER_ATTRACTIONS_URL = "https://app.ticketmaster.com/discovery/v2/attractions.json"
SEATGEEK_EVENTS_URL = "https://api.seatgeek.com/2/events"
SETLISTFM_SEARCH_URL = "https://api.setlist.fm/rest/1.0/search/setlists"
TAVILY_SEARCH_URL = "https://api.tavily.com/search"
GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
)
MAX_SUGGESTIONS = 8
PLACEHOLDER_GENRES = {"undefined", "other", "unknown"}
TORONTO = "Toronto"
TORONTO_LAT = 43.6532
TORONTO_LON = -79.3832
# How far out Ticketmaster is asked to search (catches Hamilton, Mississauga,
# Oshawa, Burlington), plus slack for venue-coordinate rounding when the
# result is re-checked locally.
SEARCH_RADIUS_KM = 50
DISTANCE_SLACK_KM = 10


class ConcertSuggestion(BaseModel):
    artist: str
    tour: Optional[str] = None
    date: str
    venue: str
    city: Optional[str] = None
    genre: Optional[str] = None
    image: Optional[str] = None
    ticket_url: Optional[str] = None
    setlist_url: Optional[str] = None
    # Ticketmaster-only enrichment. Optional so the other providers' mappers
    # (SeatGeek, setlist.fm, Tavily, Gemini) do not need to change.
    start_time: Optional[str] = None
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    price_currency: Optional[str] = None
    spotify_url: Optional[str] = None
    event_status: Optional[str] = None
    # What the form should write into the venue field: the bare venue name in
    # Toronto, "Venue (City)" outside it, so out-of-town shows stay
    # identifiable without a database column for city.
    venue_label: Optional[str] = None


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
        upcoming=bool(
            settings.ticketmaster_api_key
            or settings.seatgeek_client_id
            or settings.tavily_api_key
            or settings.gemini_api_key
        ),
        past=bool(settings.setlistfm_api_key),
    )


def _clean_genre(value: Any) -> Optional[str]:
    name = str(value or "").strip()
    if not name or name.lower() in PLACEHOLDER_GENRES:
        return None
    return name


def _normalized_artist(value: str) -> str:
    """Normalize display punctuation without turning partial matches into matches."""
    folded = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    folded = folded.casefold().replace("$", "s")
    return " ".join(re.findall(r"[a-z0-9]+", folded))


def _artist_segments(value: str) -> list[str]:
    """Return complete billing names such as ``Kendrick Lamar`` and ``SZA``."""
    return [
        normalized
        for segment in re.split(
            r"\b(?:feat\.?|ft\.?|featuring|with|and|x)\b|[,&/]", value, flags=re.IGNORECASE
        )
        for normalized in [_normalized_artist(segment)]
        if normalized
    ]


def _artist_relevance(query: str, candidate: str) -> int:
    """Score confident artist matches while rejecting incidental name fragments.

    setlist.fm's artist-name endpoint performs broad substring matching. A query
    for ``Dave`` therefore returns Player Dave, Dave Baksh, and unrelated rows.
    Single-word searches intentionally require an exact billing segment; longer
    searches may match a complete sequence inside a multi-artist billing.
    """
    wanted = _normalized_artist(query)
    actual = _normalized_artist(candidate)
    if not wanted or not actual:
        return 0
    if wanted == actual:
        return 100
    if wanted in _artist_segments(candidate):
        return 90
    wanted_tokens = wanted.split()
    actual_tokens = actual.split()
    if len(wanted_tokens) >= 2 and all(token in actual_tokens for token in wanted_tokens):
        return 70
    return 0


def _best_matching_artist(performers: list[dict[str, Any]], query: Optional[str]) -> str:
    names = [str((performer or {}).get("name") or "").strip() for performer in performers]
    names = [name for name in names if name]
    if query:
        matches = sorted(
            ((-_artist_relevance(query, name), index, name) for index, name in enumerate(names)),
        )
        if matches and -matches[0][0] > 0:
            return matches[0][2]
    return names[0] if names else ""


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


class _ResolvedAttraction(NamedTuple):
    """A Ticketmaster attraction (artist record) picked for an exact-artist search."""

    id: str
    name: str
    spotify_url: Optional[str]
    genre: Optional[str]


def _attraction_relevance(query: str, name: str) -> int:
    """Score an attraction name against the query, tolerating a leading article.

    Reuses ``_artist_relevance`` rather than reimplementing matching -- it
    already rejects incidental fragments (e.g. "Ultimate Coldplay" scores 0
    against "Coldplay"). The one gap it has is a leading article: "Weeknd"
    scores 0 against "The Weeknd" even though that is exactly the artist the
    user means. Retrying with "the " stripped from either side closes that
    gap without weakening the original scorer, and scores one point lower so
    an exact match still wins any tie.
    """
    score = _artist_relevance(query, name)
    if score:
        return score

    def _strip_the(value: str) -> str:
        return re.sub(r"^the\s+", "", value.strip(), flags=re.IGNORECASE)

    retry_score = _artist_relevance(_strip_the(query), _strip_the(name))
    return retry_score - 1 if retry_score else 0


def _pick_attraction(
    candidates: list[dict[str, Any]], query: str
) -> Optional[_ResolvedAttraction]:
    """Choose the best-matching attraction, rejecting tributes and one-offs.

    Ticketmaster's own relevance ordering is not trustworthy here: searching
    "Coldplay" can return "Ultimate Coldplay" (a tribute act) first, with the
    real Coldplay further down or absent from a short page. Every candidate is
    scored, zero-score candidates (tributes, unrelated acts) are dropped, and
    ties are broken by upcoming-event count, since Ticketmaster carries
    duplicate attraction records for one act and only the one with real
    inventory returns events.
    """
    scored: list[tuple[int, int, int, dict[str, Any]]] = []
    for index, candidate in enumerate(candidates):
        name = str((candidate or {}).get("name") or "").strip()
        if not name or not candidate.get("id"):
            continue
        score = _attraction_relevance(query, name)
        if score <= 0:
            continue
        upcoming = int(((candidate.get("upcomingEvents") or {}).get("_total")) or 0)
        scored.append((score, upcoming, index, candidate))
    if not scored:
        return None
    scored.sort(key=lambda item: (-item[0], -item[1], item[2]))
    winner = scored[0][3]
    classifications = winner.get("classifications") or []
    genre = None
    if classifications:
        genre = _clean_genre(((classifications[0] or {}).get("genre") or {}).get("name"))
    spotify_links = ((winner.get("externalLinks") or {}).get("spotify")) or []
    spotify_url = None
    if spotify_links:
        spotify_url = str((spotify_links[0] or {}).get("url") or "").strip() or None
    return _ResolvedAttraction(
        id=str(winner["id"]),
        name=str(winner.get("name") or "").strip(),
        spotify_url=spotify_url,
        genre=genre,
    )


@lru_cache(maxsize=256)
def _resolve_attraction(api_key: str, artist: str) -> Optional[_ResolvedAttraction]:
    """Resolve an artist name to a stable Ticketmaster attraction id.

    Cached per (key, artist) for the lifetime of the process -- attraction ids
    are stable, so a warm serverless instance skips the extra round-trip on
    repeat searches. Keyed on the raw api key string (not the Settings object)
    so tests can clear the cache directly.
    """
    payload = _fetch(
        TICKETMASTER_ATTRACTIONS_URL,
        {
            "apikey": api_key,
            "keyword": artist,
            "classificationName": "Music",
            # The top-ranked result is not reliable (tribute acts can rank
            # first), so fetch enough depth for `_pick_attraction` to find the
            # real artist rather than trusting Ticketmaster's own ordering.
            "size": 20,
        },
    )
    candidates = (payload.get("_embedded") or {}).get("attractions") or []
    return _pick_attraction(candidates, artist)


def _price_range(event: dict[str, Any]) -> tuple[Optional[float], Optional[float], Optional[str]]:
    """Read Ticketmaster's price range, preferring the standard price type.

    ``priceRanges`` is absent on many events (not every listing has pricing
    loaded yet), so returning ``(None, None, None)`` is the common case and
    must not raise.
    """
    ranges = [r for r in (event.get("priceRanges") or []) if isinstance(r, dict)]
    if not ranges:
        return None, None, None
    standard = [r for r in ranges if r.get("type") == "standard"]
    pool = standard or ranges
    mins = [r.get("min") for r in pool if isinstance(r.get("min"), (int, float))]
    maxes = [r.get("max") for r in pool if isinstance(r.get("max"), (int, float))]
    if not mins and not maxes:
        return None, None, None
    currency = str(pool[0].get("currency") or "").strip() or None
    return (
        float(min(mins)) if mins else None,
        float(max(maxes)) if maxes else None,
        currency,
    )


def _start_time(start: dict[str, Any]) -> Optional[str]:
    """Pull the venue-local wall-clock start time, e.g. "19:30".

    Deliberately ignores ``dates.timezone`` -- it has been observed wrong
    (a Toronto venue reporting "America/New_York"), while ``localTime`` is
    already the venue's own local clock and needs no conversion.
    """
    raw = str(start.get("localTime") or "").strip()
    candidate = raw[:5]
    if re.match(r"^\d{2}:\d{2}$", candidate):
        return candidate
    return None


def _event_status(event: dict[str, Any]) -> Optional[str]:
    """Ticketmaster's sale status, e.g. "onsale", "cancelled", "rescheduled".

    Unrecognized codes are passed through as-is rather than coerced, so a new
    Ticketmaster status degrades to an unfamiliar-but-harmless label instead
    of being mapped incorrectly.
    """
    code = str(((event.get("dates") or {}).get("status") or {}).get("code") or "").strip().lower()
    return code or None


def _venue_label(venue_name: str, city: Optional[str]) -> str:
    """What the form should write into the venue field.

    Toronto venues are left exactly as they render today; venues outside
    Toronto get the city appended in parentheses so out-of-town shows stay
    identifiable without a database column for city. `ConcertCard` and
    `concertInsights` already strip a trailing parenthetical, so this reads
    and groups correctly with no other changes.
    """
    if not city or city.strip().casefold() == TORONTO.casefold():
        return venue_name
    return f"{venue_name} ({city.strip()})"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(a))


def _venue_distance_km(venue: dict[str, Any]) -> Optional[float]:
    """Distance from downtown Toronto, in km. Ticketmaster's lat/long are strings."""
    location = venue.get("location") or {}
    try:
        lat = float(location["latitude"])
        lon = float(location["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    return _haversine_km(TORONTO_LAT, TORONTO_LON, lat, lon)


def _ticketmaster_suggestion(
    event: dict[str, Any],
    artist_query: Optional[str] = None,
    attraction: Optional[_ResolvedAttraction] = None,
) -> Optional[ConcertSuggestion]:
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
    artist = _best_matching_artist(attractions, artist_query)
    # A search by attractionId can still omit the headliner from the event's
    # own embedded attractions (festival/multi-bill listings). Falling back to
    # the artist we already resolved keeps a correct event from being dropped
    # by the caller's relevance filter.
    if not artist and attraction:
        artist = attraction.name

    classifications = event.get("classifications") or []
    genre = None
    if classifications:
        genre = _clean_genre(((classifications[0] or {}).get("genre") or {}).get("name"))
    if not genre and attraction:
        genre = attraction.genre

    spotify_url = None
    matching_attraction = next(
        (
            a
            for a in attractions
            if str((a or {}).get("name") or "").strip().casefold() == artist.casefold()
        ),
        None,
    )
    if matching_attraction:
        spotify_links = ((matching_attraction.get("externalLinks") or {}).get("spotify")) or []
        if spotify_links:
            spotify_url = str((spotify_links[0] or {}).get("url") or "").strip() or None
    if not spotify_url and attraction:
        spotify_url = attraction.spotify_url

    city = str((venue.get("city") or {}).get("name") or "").strip() or None
    price_min, price_max, price_currency = _price_range(event)

    return ConcertSuggestion(
        artist=artist or event_name,
        tour=_tour_name(event_name, artist),
        date=local_date,
        venue=venue_name,
        city=city,
        genre=genre,
        image=_best_image(event.get("images") or []),
        ticket_url=str(event.get("url") or "").strip() or None,
        start_time=_start_time(start),
        price_min=price_min,
        price_max=price_max,
        price_currency=price_currency,
        spotify_url=spotify_url,
        event_status=_event_status(event),
        venue_label=_venue_label(venue_name, city),
    )


def _seatgeek_suggestion(
    event: dict[str, Any], artist_query: Optional[str] = None
) -> Optional[ConcertSuggestion]:
    venue = event.get("venue") or {}
    venue_name = str(venue.get("name") or "").strip()
    # SeatGeek returns an ISO local datetime; the form only stores the date.
    local_date = str(event.get("datetime_local") or "")[:10].strip()
    if not venue_name or len(local_date) != 10:
        return None

    performers = event.get("performers") or []
    primary = (performers[0] or {}) if performers else {}
    artist = _best_matching_artist(performers, artist_query)
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
        setlist_url=str(entry.get("url") or "").strip() or None,
    )


MONTH_DATE = re.compile(
    r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b",
    re.IGNORECASE,
)


def _tavily_suggestion(event: dict[str, Any], artist: str) -> Optional[ConcertSuggestion]:
    """Convert a Tavily result when its Toronto event details are explicit."""
    text = " ".join(str(event.get(key) or "") for key in ("title", "content", "answer"))
    if "toronto" not in text.casefold():
        return None
    dates = MONTH_DATE.findall(text)
    if not dates:
        return None
    raw_date = dates[0]
    try:
        date = datetime.strptime(raw_date, "%b %d, %Y").date()
    except ValueError:
        try:
            date = datetime.strptime(raw_date, "%B %d, %Y").date()
        except ValueError:
            return None
    venue_match = re.search(
        r"([A-Z][A-Za-z0-9'&./-]*(?:\s+[A-Z][A-Za-z0-9'&./-]*){0,6}),\s+Toronto\b",
        text,
    )
    if not venue_match:
        venue_match = re.search(
            r"\bat\s+([A-Z][A-Za-z0-9'&./-]*(?:\s+[A-Z][A-Za-z0-9'&./-]*){0,6}?)(?:\.|,|\s+Toronto\b)",
            text,
        )
    if not venue_match:
        return None
    tour_match = re.search(
        r"\b((?:The\s+)?[A-Z][A-Za-z0-9/&'().-]*(?:\s+[A-Z][A-Za-z0-9/&'().-]*){0,5}\s+Tour)\b",
        text,
    )
    return ConcertSuggestion(
        artist=artist,
        tour=tour_match.group(1).strip() if tour_match else None,
        date=date.isoformat(),
        venue=venue_match.group(1).strip(),
        city=TORONTO,
        genre=None,
        image=None,
        ticket_url=str(event.get("url") or "").strip() or None,
    )


def _search_tavily(settings: Settings, artist: str, city: str) -> list[dict[str, Any]]:
    query = f"{artist} upcoming concert {city} 2026 official venue tickets"
    try:
        response = httpx.post(
            TAVILY_SEARCH_URL,
            headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
            json={
                "query": query,
                "search_depth": "basic",
                "max_results": MAX_SUGGESTIONS,
                "include_answer": "basic",
            },
            timeout=15,
        )
        if response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Tavily search quota is unavailable. "
                    "Wait for the free monthly credits to reset."
                ),
            )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Tavily concert search is temporarily unavailable",
        ) from exc
    results = payload.get("results") or []
    answer = payload.get("answer")
    if isinstance(answer, str) and answer.strip() and results:
        # Keep the source URL attached to the result instead of turning the
        # answer into a synthetic, uncited event row.
        results[0]["answer"] = answer
    return results


def _fetch(
    url: str,
    params: dict[str, Any],
    headers: Optional[dict[str, str]] = None,
    empty_on_404: bool = False,
) -> dict[str, Any]:
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=10, follow_redirects=True)
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


def _search_ticketmaster(
    settings: Settings, artist: str, attraction: Optional[_ResolvedAttraction]
) -> list[dict[str, Any]]:
    # A resolved attractionId is an exact-artist search and needs no keyword;
    # otherwise fall back to keyword matching (which also matches venue
    # names, e.g. "Drake" hitting "Drake Underground" -- the caller's
    # relevance filter cleans that noise up same as it does today).
    params: dict[str, Any] = {
        "apikey": settings.ticketmaster_api_key,
        "latlong": f"{TORONTO_LAT},{TORONTO_LON}",
        "radius": SEARCH_RADIUS_KM,
        "unit": "km",
        "countryCode": "CA",
        "classificationName": "Music",
        "sort": "date,asc",
        "size": 50,
        # Anchored to today at UTC midnight rather than `now()`: Ticketmaster's
        # own `dates.timezone` has been observed wrong, so a wall-clock cutoff
        # avoids dropping a show that starts later today. The caller applies
        # its own local-date guard as a second check.
        "startDateTime": f"{datetime.now(timezone.utc).date().isoformat()}T00:00:00Z",
    }
    if attraction:
        params["attractionId"] = attraction.id
    else:
        params["keyword"] = artist
    payload = _fetch(TICKETMASTER_EVENTS_URL, params)
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


def _search_gemini(settings: Settings, artist: str, city: str) -> list[dict[str, Any]]:
    """Find future Toronto shows through Gemini's grounded Google Search."""
    today = datetime.now().date().isoformat()
    prompt = f"""
Search the live web for upcoming concerts or tour dates for {artist} in {city},
Ontario, Canada, on or after {today}. Return only actual public events, not
rumours, cancelled events, or generic tour announcements. Prefer official
artist, venue, promoter, or ticketing pages. Return at most {MAX_SUGGESTIONS}
results, sorted by date ascending.

Return JSON in exactly this shape:
{{"events":[{{"artist":"...","tour":"...","date":"YYYY-MM-DD",
"venue":"...","city":"Toronto","genre":"...","ticket_url":"..."}}]}}
Use null when tour, genre, or ticket_url is not known. Do not include events
outside Toronto, and do not invent missing dates or venues.
""".strip()
    request_body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "events": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "artist": {"type": "STRING"},
                                "tour": {"type": "STRING", "nullable": True},
                                "date": {"type": "STRING"},
                                "venue": {"type": "STRING"},
                                "city": {"type": "STRING"},
                                "genre": {"type": "STRING", "nullable": True},
                                "ticket_url": {"type": "STRING", "nullable": True},
                            },
                            "required": ["artist", "date", "venue", "city"],
                        },
                    }
                },
                "required": ["events"],
            },
        },
    }
    try:
        response = httpx.post(
            GEMINI_GENERATE_URL,
            params={"key": settings.gemini_api_key},
            json=request_body,
            timeout=20,
            follow_redirects=True,
        )
        if response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Gemini search quota is unavailable. "
                    "Wait for the free quota to reset or use another configured provider."
                ),
            )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Concert search is temporarily unavailable",
        ) from exc
    candidates = payload.get("candidates") or []
    parts = ((candidates[0] if candidates else {}).get("content") or {}).get("parts") or []
    text = next((part.get("text") for part in parts if isinstance(part.get("text"), str)), "")
    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        return []
    return payload.get("events") or []


def _gemini_suggestion(event: dict[str, Any]) -> Optional[ConcertSuggestion]:
    date = str(event.get("date") or "").strip()
    venue = str(event.get("venue") or "").strip()
    if not date or not venue:
        return None
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return None
    return ConcertSuggestion(
        artist=str(event.get("artist") or "").strip(),
        tour=str(event.get("tour") or "").strip() or None,
        date=date,
        venue=venue,
        city=str(event.get("city") or "").strip() or None,
        genre=_clean_genre(event.get("genre")),
        image=None,
        ticket_url=str(event.get("ticket_url") or "").strip() or None,
    )


@router.get("/concerts", response_model=SuggestionResponse)
def suggest_concerts(
    artist: str = Query(min_length=1, max_length=120),
    mode: str = Query(default="upcoming", pattern="^(upcoming|past)$"),
    # Kept as an optional query parameter for backwards-compatible clients,
    # but the value is ignored: Ticketmaster search is a fixed radius around
    # Toronto (see SEARCH_RADIUS_KM), and the other providers use TORONTO.
    city: Optional[str] = Query(default=None, max_length=80),
) -> SuggestionResponse:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    artist_query = artist.strip()
    attraction: Optional[_ResolvedAttraction] = None

    if mode == "past":
        if not settings.setlistfm_api_key:
            return SuggestionResponse(configured=False, results=[], provider=None)
        provider = "setlistfm"
        events = _search_setlistfm(settings, artist_query, TORONTO)
        to_suggestion = _setlistfm_suggestion
    elif settings.ticketmaster_api_key:
        provider = "ticketmaster"
        attraction = _resolve_attraction(settings.ticketmaster_api_key, artist_query)
        events = _search_ticketmaster(settings, artist_query, attraction)

        def to_suggestion(event):
            return _ticketmaster_suggestion(event, artist_query, attraction)
    elif settings.seatgeek_client_id:
        provider = "seatgeek"
        events = _search_seatgeek(settings, artist_query, TORONTO)

        def to_suggestion(event):
            return _seatgeek_suggestion(event, artist_query)
    elif settings.tavily_api_key:
        provider = "tavily"
        events = _search_tavily(settings, artist_query, TORONTO)

        def to_suggestion(event):
            return _tavily_suggestion(event, artist_query)
    elif settings.gemini_api_key:
        provider = "gemini"
        events = _search_gemini(settings, artist_query, TORONTO)
        to_suggestion = _gemini_suggestion
    else:
        return SuggestionResponse(configured=False, results=[], provider=None)

    ranked: list[tuple[int, int, ConcertSuggestion]] = []
    seen: set[tuple[str, str]] = set()
    for event in events:
        suggestion = to_suggestion(event)
        if suggestion is None:
            continue
        relevance = _artist_relevance(artist_query, suggestion.artist)
        if relevance == 0:
            continue
        if provider == "ticketmaster":
            # Ticketmaster's own `radius` search already constrains results;
            # this only drops rows whose coordinates round outside it after a
            # local re-check. Rows with no coordinates are kept rather than
            # dropped -- the API already filtered them by radius.
            venue = ((event.get("_embedded") or {}).get("venues") or [{}])[0] or {}
            distance = _venue_distance_km(venue)
            if distance is not None and distance > SEARCH_RADIUS_KM + DISTANCE_SLACK_KM:
                continue
        elif (suggestion.city or "").strip().casefold() != TORONTO.casefold():
            continue
        if mode == "upcoming" and suggestion.date < datetime.now().date().isoformat():
            continue
        key = (suggestion.date, suggestion.venue.lower())
        if key in seen:
            continue
        seen.add(key)
        # Cancelled/offsale shows stay visible (mapped onto the app's own
        # "Cancelled" status by the caller) but never crowd live shows out of
        # the truncated result list.
        status_rank = 1 if suggestion.event_status in {"cancelled", "offsale"} else 0
        ranked.append((relevance, status_rank, suggestion))

    ranked.sort(key=lambda item: (-item[0], item[1], item[2].date, item[2].artist.casefold()))
    results = [suggestion for _, _, suggestion in ranked[:MAX_SUGGESTIONS]]
    return SuggestionResponse(configured=True, results=results, provider=provider)
