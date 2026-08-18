from backend.discovery_routes import (
    _artist_relevance,
    _gemini_suggestion,
    _seatgeek_suggestion,
    _setlistfm_suggestion,
    _tavily_suggestion,
    _ticketmaster_suggestion,
    _tour_name,
    suggest_concerts,
)
from backend.settings import Settings

# Trimmed from a real api.setlist.fm response for Kendrick Lamar in Toronto.
SETLISTFM_ENTRY = {
    "id": "735fce79",
    "eventDate": "13-06-2025",
    "artist": {"name": "Kendrick Lamar & SZA"},
    "venue": {
        "name": "Rogers Centre",
        "city": {"name": "Toronto", "country": {"code": "CA"}},
    },
    "tour": {"name": "Grand National Tour"},
    "url": "https://www.setlist.fm/setlist/kendrick-lamar-and-sza/2025/x.html",
}

TICKETMASTER_EVENT = {
    "name": "Yeat: The Bell Tour",
    "url": "https://ticketmaster.ca/event/123",
    "images": [
        {"url": "https://img/small.jpg", "ratio": "16_9", "width": 300},
        {"url": "https://img/wide.jpg", "ratio": "16_9", "width": 2048},
        {"url": "https://img/tall.jpg", "ratio": "4_3", "width": 3000},
    ],
    "dates": {"start": {"localDate": "2026-09-14"}},
    "classifications": [{"genre": {"name": "Hip-Hop/Rap"}}],
    "_embedded": {
        "venues": [{"name": "Scotiabank Arena", "city": {"name": "Toronto"}}],
        "attractions": [{"name": "Yeat"}],
    },
}

SEATGEEK_EVENT = {
    "title": "Yeat: The Bell Tour",
    "url": "https://seatgeek.com/event/456",
    "datetime_local": "2026-09-14T20:00:00",
    "venue": {"name": "Scotiabank Arena", "city": "Toronto"},
    "performers": [
        {
            "name": "Yeat",
            "image": "https://sg/yeat.jpg",
            "genres": [{"name": "Rap"}],
        }
    ],
}


def test_ticketmaster_event_maps_to_suggestion():
    suggestion = _ticketmaster_suggestion(TICKETMASTER_EVENT)
    assert suggestion is not None
    assert suggestion.artist == "Yeat"
    assert suggestion.tour == "Yeat: The Bell Tour"
    assert suggestion.date == "2026-09-14"
    assert suggestion.venue == "Scotiabank Arena"
    assert suggestion.city == "Toronto"
    assert suggestion.genre == "Hip-Hop/Rap"
    # Widest of the preferred wide ratios, not the taller 4_3 crop.
    assert suggestion.image == "https://img/wide.jpg"
    assert suggestion.ticket_url == "https://ticketmaster.ca/event/123"


def test_seatgeek_event_maps_to_suggestion():
    suggestion = _seatgeek_suggestion(SEATGEEK_EVENT)
    assert suggestion is not None
    assert suggestion.artist == "Yeat"
    assert suggestion.tour == "Yeat: The Bell Tour"
    assert suggestion.date == "2026-09-14"
    assert suggestion.venue == "Scotiabank Arena"
    assert suggestion.city == "Toronto"
    assert suggestion.genre == "Rap"
    assert suggestion.image == "https://sg/yeat.jpg"


def test_both_providers_agree_on_shape():
    ticketmaster = _ticketmaster_suggestion(TICKETMASTER_EVENT)
    seatgeek = _seatgeek_suggestion(SEATGEEK_EVENT)
    assert ticketmaster is not None and seatgeek is not None
    shared = ("artist", "tour", "date", "venue", "city")
    assert all(getattr(ticketmaster, f) == getattr(seatgeek, f) for f in shared)


def test_tour_is_dropped_when_it_only_repeats_the_artist():
    assert _tour_name("Yeat", "Yeat") is None
    assert _tour_name("yeat", "Yeat") is None
    assert _tour_name("", "Yeat") is None
    assert _tour_name("Yeat: The Bell Tour", "Yeat") == "Yeat: The Bell Tour"


def test_placeholder_genres_are_dropped():
    event = {**TICKETMASTER_EVENT, "classifications": [{"genre": {"name": "Undefined"}}]}
    suggestion = _ticketmaster_suggestion(event)
    assert suggestion is not None
    assert suggestion.genre is None

    sg_performer = {**SEATGEEK_EVENT["performers"][0], "genres": [{"name": "Other"}]}
    sg_event = {**SEATGEEK_EVENT, "performers": [sg_performer]}
    sg_suggestion = _seatgeek_suggestion(sg_event)
    assert sg_suggestion is not None
    assert sg_suggestion.genre is None


def test_setlistfm_entry_maps_to_suggestion():
    suggestion = _setlistfm_suggestion(SETLISTFM_ENTRY)
    assert suggestion is not None
    assert suggestion.artist == "Kendrick Lamar & SZA"
    assert suggestion.tour == "Grand National Tour"
    # dd-MM-yyyy is converted to the ISO date the library stores.
    assert suggestion.date == "2025-06-13"
    assert suggestion.venue == "Rogers Centre"
    assert suggestion.city == "Toronto"
    # setlist.fm classifies neither of these.
    assert suggestion.genre is None
    assert suggestion.image is None
    assert suggestion.setlist_url == SETLISTFM_ENTRY["url"]
    assert suggestion.ticket_url is None


def test_artist_relevance_keeps_exact_and_billing_matches_but_rejects_incidental_partials():
    assert _artist_relevance("Dave", "Dave") > 0
    assert _artist_relevance("Kendrick Lamar", "Kendrick Lamar & SZA") > 0
    assert _artist_relevance("J Cole", "J. Cole") > 0
    assert _artist_relevance("Dave", "Dave Baksh") == 0
    assert _artist_relevance("Dave", "Player Dave") == 0


def test_setlistfm_rejects_unparseable_dates():
    for bad in ("", "2025-06-13", "31-31-2025", "not a date"):
        assert _setlistfm_suggestion({**SETLISTFM_ENTRY, "eventDate": bad}) is None


def test_setlistfm_entry_missing_venue_is_skipped():
    assert _setlistfm_suggestion({**SETLISTFM_ENTRY, "venue": {}}) is None


def test_events_missing_venue_or_date_are_skipped():
    no_venue = {**TICKETMASTER_EVENT, "_embedded": {"attractions": [{"name": "Yeat"}]}}
    assert _ticketmaster_suggestion(no_venue) is None

    no_date = {**TICKETMASTER_EVENT, "dates": {"start": {}}}
    assert _ticketmaster_suggestion(no_date) is None

    sg_no_venue = {**SEATGEEK_EVENT, "venue": {}}
    assert _seatgeek_suggestion(sg_no_venue) is None

    sg_bad_date = {**SEATGEEK_EVENT, "datetime_local": ""}
    assert _seatgeek_suggestion(sg_bad_date) is None


def test_discovery_is_toronto_only_even_when_provider_returns_other_cities(monkeypatch):
    import backend.discovery_routes as discovery

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    monkeypatch.setattr(discovery, "get_settings", lambda: settings)
    monkeypatch.setattr(
        discovery,
        "_search_ticketmaster",
        lambda _settings, _artist, city: [
            TICKETMASTER_EVENT,
            {
                **TICKETMASTER_EVENT,
                "dates": {"start": {"localDate": "2026-10-01"}},
                "_embedded": {
                    "venues": [{"name": "Madison Square Garden", "city": {"name": "New York"}}],
                    "attractions": [{"name": "Yeat"}],
                },
            },
        ],
    )

    response = suggest_concerts(artist="Yeat", mode="upcoming", city="New York")

    assert response.results[0].city == "Toronto"
    assert len(response.results) == 1


def test_gemini_event_maps_to_suggestion():
    suggestion = _gemini_suggestion(
        {
            "artist": "Yeat",
            "tour": "The Bell Tour",
            "date": "2026-09-14",
            "venue": "Scotiabank Arena",
            "city": "Toronto",
            "genre": "Hip-Hop",
            "ticket_url": "https://example.com/tickets",
        }
    )

    assert suggestion is not None
    assert suggestion.artist == "Yeat"
    assert suggestion.city == "Toronto"
    assert suggestion.ticket_url == "https://example.com/tickets"


def test_tavily_result_maps_only_explicit_toronto_event_details():
    suggestion = _tavily_suggestion(
        {
            "title": "Yeat Toronto Tickets - Coca-Cola Coliseum | Sep 13, 2026",
            "content": "Yeat concert Sep 13, 2026 at Coca-Cola Coliseum, Toronto, ON.",
            "url": "https://example.com/yeat-toronto",
        },
        "Yeat",
    )

    assert suggestion is not None
    assert suggestion.date == "2026-09-13"
    assert suggestion.venue == "Coca-Cola Coliseum"
    assert suggestion.city == "Toronto"
