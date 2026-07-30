from backend.discovery_routes import (
    _seatgeek_suggestion,
    _ticketmaster_suggestion,
    _tour_name,
)

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


def test_events_missing_venue_or_date_are_skipped():
    no_venue = {**TICKETMASTER_EVENT, "_embedded": {"attractions": [{"name": "Yeat"}]}}
    assert _ticketmaster_suggestion(no_venue) is None

    no_date = {**TICKETMASTER_EVENT, "dates": {"start": {}}}
    assert _ticketmaster_suggestion(no_date) is None

    sg_no_venue = {**SEATGEEK_EVENT, "venue": {}}
    assert _seatgeek_suggestion(sg_no_venue) is None

    sg_bad_date = {**SEATGEEK_EVENT, "datetime_local": ""}
    assert _seatgeek_suggestion(sg_bad_date) is None
