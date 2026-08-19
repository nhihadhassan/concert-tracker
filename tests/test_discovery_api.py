from backend.discovery_routes import (
    _artist_relevance,
    _gemini_suggestion,
    _pick_attraction,
    _resolve_attraction,
    _ResolvedAttraction,
    _search_ticketmaster,
    _seatgeek_suggestion,
    _setlistfm_suggestion,
    _tavily_suggestion,
    _ticketmaster_suggestion,
    _tour_name,
    _venue_label,
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
    "dates": {
        "start": {"localDate": "2026-09-14", "localTime": "19:30:00"},
        "status": {"code": "onsale"},
    },
    "classifications": [{"genre": {"name": "Hip-Hop/Rap"}}],
    "priceRanges": [{"type": "standard", "currency": "CAD", "min": 79.0, "max": 249.5}],
    "_embedded": {
        "venues": [
            {
                "name": "Scotiabank Arena",
                "city": {"name": "Toronto"},
                "state": {"stateCode": "ON"},
                "location": {"latitude": "43.6435", "longitude": "-79.3791"},
            }
        ],
        "attractions": [
            {
                "name": "Yeat",
                "externalLinks": {"spotify": [{"url": "https://open.spotify.com/artist/abc"}]},
            }
        ],
    },
}

# Same act, a Hamilton date -- inside the 50km search radius.
TICKETMASTER_HAMILTON_EVENT = {
    **TICKETMASTER_EVENT,
    "dates": {
        "start": {"localDate": "2026-09-20", "localTime": "20:00:00"},
        "status": {"code": "onsale"},
    },
    "_embedded": {
        "venues": [
            {
                "name": "FirstOntario Centre",
                "city": {"name": "Hamilton"},
                "location": {"latitude": "43.2560", "longitude": "-79.8711"},
            }
        ],
        "attractions": [{"name": "Yeat"}],
    },
}

# Same act, a Montreal date -- well outside the 50km search radius.
TICKETMASTER_MONTREAL_EVENT = {
    **TICKETMASTER_EVENT,
    "dates": {
        "start": {"localDate": "2026-09-25", "localTime": "20:00:00"},
        "status": {"code": "onsale"},
    },
    "_embedded": {
        "venues": [
            {
                "name": "Bell Centre",
                "city": {"name": "Montreal"},
                "location": {"latitude": "45.4961", "longitude": "-73.5693"},
            }
        ],
        "attractions": [{"name": "Yeat"}],
    },
}

# Trimmed from a real attractions.json page for "Coldplay": a tribute act
# ranks first, the real band is further down but carries real inventory.
ATTRACTIONS_PAGE = [
    {"id": "K-trib", "name": "Ultimate Coldplay", "upcomingEvents": {"_total": 5}},
    {
        "id": "K8vZ917",
        "name": "Coldplay",
        "upcomingEvents": {"_total": 42},
        "externalLinks": {"spotify": [{"url": "https://open.spotify.com/artist/coldplay"}]},
        "classifications": [{"genre": {"name": "Rock"}}],
    },
]

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


def test_ticketmaster_suggestion_carries_time_price_status_and_spotify():
    suggestion = _ticketmaster_suggestion(TICKETMASTER_EVENT)
    assert suggestion is not None
    assert suggestion.start_time == "19:30"
    assert suggestion.price_min == 79.0
    assert suggestion.price_max == 249.5
    assert suggestion.price_currency == "CAD"
    assert suggestion.event_status == "onsale"
    assert suggestion.spotify_url == "https://open.spotify.com/artist/abc"


def test_ticketmaster_suggestion_without_price_ranges_leaves_price_null():
    event = {k: v for k, v in TICKETMASTER_EVENT.items() if k != "priceRanges"}
    suggestion = _ticketmaster_suggestion(event)
    assert suggestion is not None
    assert suggestion.price_min is None
    assert suggestion.price_max is None
    assert suggestion.price_currency is None


def test_ticketmaster_suggestion_maps_cancelled_status():
    event = {
        **TICKETMASTER_EVENT,
        "dates": {**TICKETMASTER_EVENT["dates"], "status": {"code": "cancelled"}},
    }
    suggestion = _ticketmaster_suggestion(event)
    assert suggestion is not None
    assert suggestion.event_status == "cancelled"


def test_ticketmaster_suggestion_ignores_a_wrong_timezone():
    # A Toronto venue has been observed reporting a "America/New_York" zone;
    # localTime is already venue-local, so it must not be reinterpreted.
    event = {
        **TICKETMASTER_EVENT,
        "dates": {**TICKETMASTER_EVENT["dates"], "timezone": "America/New_York"},
    }
    suggestion = _ticketmaster_suggestion(event)
    assert suggestion is not None
    assert suggestion.start_time == "19:30"


def test_venue_label_appends_city_only_outside_toronto():
    assert _venue_label("Scotiabank Arena", "Toronto") == "Scotiabank Arena"
    assert _venue_label("Scotiabank Arena", None) == "Scotiabank Arena"
    assert _venue_label("FirstOntario Centre", "Hamilton") == "FirstOntario Centre (Hamilton)"


def test_suggestion_uses_resolved_attraction_name_when_event_omits_the_headliner():
    # A search by attractionId can still return an event whose own embedded
    # attractions list omits the headliner (festival/multi-bill listings).
    event = {
        **TICKETMASTER_EVENT,
        "_embedded": {**TICKETMASTER_EVENT["_embedded"], "attractions": []},
    }
    attraction = _ResolvedAttraction(id="K8vZ917Q3M0", name="Yeat", spotify_url=None, genre=None)
    suggestion = _ticketmaster_suggestion(event, "Yeat", attraction)
    assert suggestion is not None
    assert suggestion.artist == "Yeat"


def test_attraction_pick_rejects_tribute_bands():
    picked = _pick_attraction(ATTRACTIONS_PAGE, "Coldplay")
    assert picked is not None
    assert picked.id == "K8vZ917"
    assert picked.name == "Coldplay"
    assert picked.spotify_url == "https://open.spotify.com/artist/coldplay"
    assert picked.genre == "Rock"


def test_attraction_pick_returns_none_when_only_tributes_match():
    assert _pick_attraction([ATTRACTIONS_PAGE[0]], "Coldplay") is None


def test_attraction_pick_breaks_ties_on_upcoming_event_count():
    candidates = [
        {"id": "low", "name": "Coldplay", "upcomingEvents": {"_total": 0}},
        {"id": "high", "name": "Coldplay", "upcomingEvents": {"_total": 42}},
    ]
    picked = _pick_attraction(candidates, "Coldplay")
    assert picked is not None
    assert picked.id == "high"


def test_attraction_pick_tolerates_a_leading_article():
    candidates = [{"id": "w1", "name": "The Weeknd", "upcomingEvents": {"_total": 10}}]
    picked = _pick_attraction(candidates, "Weeknd")
    assert picked is not None
    assert picked.id == "w1"

    # Negative control: article-tolerance must not become fuzzy matching.
    tribute = [{"id": "w2", "name": "Weeknd Tribute Band", "upcomingEvents": {"_total": 3}}]
    assert _pick_attraction(tribute, "Weeknd") is None


def test_search_uses_attraction_id_when_resolved(monkeypatch):
    import backend.discovery_routes as discovery

    captured: dict = {}

    def fake_fetch(url, params, headers=None, empty_on_404=False):
        captured["params"] = params
        return {"_embedded": {"events": [TICKETMASTER_EVENT]}}

    monkeypatch.setattr(discovery, "_fetch", fake_fetch)
    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    attraction = _ResolvedAttraction(id="K8vZ917Q3M0", name="Yeat", spotify_url=None, genre=None)

    _search_ticketmaster(settings, "Yeat", attraction)

    params = captured["params"]
    assert params["attractionId"] == "K8vZ917Q3M0"
    assert params["latlong"] == "43.6532,-79.3832"
    assert params["radius"] == 50
    assert params["unit"] == "km"
    assert "keyword" not in params
    assert "city" not in params


def test_search_falls_back_to_keyword_when_no_attraction_matches(monkeypatch):
    import backend.discovery_routes as discovery

    captured: dict = {}

    def fake_fetch(url, params, headers=None, empty_on_404=False):
        captured["params"] = params
        return {"_embedded": {"events": []}}

    monkeypatch.setattr(discovery, "_fetch", fake_fetch)
    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )

    _search_ticketmaster(settings, "Yeat", None)

    assert captured["params"]["keyword"] == "Yeat"
    assert "attractionId" not in captured["params"]


def test_attraction_resolution_is_cached(monkeypatch):
    import backend.discovery_routes as discovery

    _resolve_attraction.cache_clear()
    calls: list[dict] = []

    def fake_fetch(url, params, headers=None, empty_on_404=False):
        calls.append(params)
        return {"_embedded": {"attractions": [ATTRACTIONS_PAGE[1]]}}

    monkeypatch.setattr(discovery, "_fetch", fake_fetch)

    first = _resolve_attraction("key-1", "Coldplay")
    second = _resolve_attraction("key-1", "Coldplay")

    assert first == second
    assert len(calls) == 1


def test_discovery_keeps_nearby_cities_and_drops_distant_ones(monkeypatch):
    import backend.discovery_routes as discovery

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    monkeypatch.setattr(discovery, "get_settings", lambda: settings)
    monkeypatch.setattr(discovery, "_resolve_attraction", lambda _key, _artist: None)
    monkeypatch.setattr(
        discovery,
        "_search_ticketmaster",
        lambda _settings, _artist, _attraction: [
            TICKETMASTER_EVENT,
            TICKETMASTER_HAMILTON_EVENT,
            TICKETMASTER_MONTREAL_EVENT,
        ],
    )

    response = suggest_concerts(artist="Yeat", mode="upcoming")

    assert {r.city for r in response.results} == {"Toronto", "Hamilton"}
    assert len(response.results) == 2


def test_cancelled_shows_rank_below_live_shows(monkeypatch):
    import backend.discovery_routes as discovery

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    monkeypatch.setattr(discovery, "get_settings", lambda: settings)
    monkeypatch.setattr(discovery, "_resolve_attraction", lambda _key, _artist: None)

    cancelled_earlier = {
        **TICKETMASTER_EVENT,
        "dates": {
            "start": {"localDate": "2026-09-10", "localTime": "19:00:00"},
            "status": {"code": "cancelled"},
        },
    }
    live_later = {
        **TICKETMASTER_EVENT,
        "dates": {
            "start": {"localDate": "2026-09-30", "localTime": "19:00:00"},
            "status": {"code": "onsale"},
        },
    }
    monkeypatch.setattr(
        discovery,
        "_search_ticketmaster",
        lambda _settings, _artist, _attraction: [cancelled_earlier, live_later],
    )

    response = suggest_concerts(artist="Yeat", mode="upcoming")

    assert [r.date for r in response.results] == ["2026-09-30", "2026-09-10"]


def test_duplicate_listings_for_the_same_date_and_venue_are_deduped(monkeypatch):
    import backend.discovery_routes as discovery

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    monkeypatch.setattr(discovery, "get_settings", lambda: settings)
    monkeypatch.setattr(discovery, "_resolve_attraction", lambda _key, _artist: None)
    monkeypatch.setattr(
        discovery,
        "_search_ticketmaster",
        lambda _settings, _artist, _attraction: [TICKETMASTER_EVENT, TICKETMASTER_EVENT],
    )

    response = suggest_concerts(artist="Yeat", mode="upcoming")

    assert len(response.results) == 1


def test_route_falls_back_to_keyword_search_and_still_filters_irrelevant_matches(monkeypatch):
    import backend.discovery_routes as discovery

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    monkeypatch.setattr(discovery, "get_settings", lambda: settings)
    monkeypatch.setattr(discovery, "_resolve_attraction", lambda _key, _artist: None)

    # Mirrors a real keyword search matching a venue name rather than the
    # artist: the attraction on the event is unrelated to the query.
    noise_event = {
        **TICKETMASTER_EVENT,
        "dates": {"start": {"localDate": "2026-09-20", "localTime": "19:00:00"}},
        "_embedded": {
            **TICKETMASTER_EVENT["_embedded"],
            "attractions": [{"name": "Phoebe Ryan"}],
        },
    }
    monkeypatch.setattr(
        discovery,
        "_search_ticketmaster",
        lambda _settings, _artist, _attraction: [noise_event, TICKETMASTER_EVENT],
    )

    response = suggest_concerts(artist="Yeat", mode="upcoming")

    assert len(response.results) == 1
    assert response.results[0].artist == "Yeat"


def test_discovery_status_hides_past_mode_without_a_setlistfm_key(monkeypatch):
    import backend.discovery_routes as discovery

    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="key",
        ticketmaster_api_key="ticket-key",
    )
    monkeypatch.setattr(discovery, "get_settings", lambda: settings)

    result = discovery.discovery_status()

    assert result.upcoming is True
    assert result.past is False


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
