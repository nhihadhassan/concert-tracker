from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from backend.domain.analytics import AnalyticsConcert, calculate_analytics


def concert(
    concert_id: str,
    artist: str,
    concert_date: date,
    *,
    venue: str = "Scotiabank Arena",
    status: str = "Attended",
    price: str | None = None,
    genre: str | None = "Hip-Hop",
    projected: str | None = None,
    nhihad: str | None = None,
    rachel: str | None = None,
) -> AnalyticsConcert:
    member_ratings = {
        member: Decimal(value) if value is not None else None
        for member, value in (("nhihad", nhihad), ("rachel", rachel))
    }
    available = [value for value in member_ratings.values() if value is not None]
    combined = (
        (sum(available, Decimal("0")) / Decimal(len(available))).quantize(Decimal("0.1"))
        if available
        else None
    )
    return AnalyticsConcert(
        concert_id=concert_id,
        artist=artist,
        concert_date=concert_date,
        venue=venue,
        status=status,
        price=Decimal(price) if price is not None else None,
        genre=genre,
        projected_rating=Decimal(projected) if projected is not None else None,
        member_ratings=member_ratings,
        combined_rating=combined,
    )


def test_analytics_cover_spending_projection_groups_and_rankings() -> None:
    rows = [
        concert(
            "a",
            "Don Toliver 2023",
            date(2023, 6, 22),
            price="100",
            projected="8",
            nhihad="9",
            rachel="8",
        ),
        concert(
            "b",
            "Don Toliver 2024",
            date(2024, 11, 14),
            venue="Scotiabank Arena (40 Bay St., Toronto)",
            price="150",
            projected="9",
            nhihad="10",
            rachel="9",
        ),
        concert(
            "c",
            "J Cole",
            date(2026, 7, 28),
            status="Want to Go",
            price="50",
        ),
        concert(
            "d",
            "Cancelled Artist",
            date(2020, 1, 1),
            status="Cancelled",
            price="999",
            genre=None,
        ),
    ]

    result = calculate_analytics(rows)

    assert result.total_concerts == 4
    assert result.status_counts == {"Attended": 2, "Want to Go": 1, "Cancelled": 1}
    assert result.spending.total_spent_excluding_cancelled == Decimal("300.00")
    assert result.spending.attended_spent == Decimal("250.00")
    assert result.spending.upcoming_committed == Decimal("50.00")
    assert result.spending.average_attended_ticket == Decimal("125.00")
    assert result.rating_summaries[0].average_rating == Decimal("9.00")
    assert result.projection.mean_absolute_error == Decimal("0.50")
    assert result.projection.bias == Decimal("0.50")
    assert result.projection.within_one_point_percent == Decimal("100.0")
    assert result.repeat_artists[0].key == "Don Toliver"
    assert result.repeat_artists[0].concerts == 2
    assert result.venue_summaries[0].key == "Scotiabank Arena"
    assert result.venue_summaries[0].concerts == 4
    assert result.rankings["combined"][0].concert_id == "b"
    assert result.rankings["nhihad"][0].rating == Decimal("10")


def test_empty_analytics_are_well_formed() -> None:
    result = calculate_analytics([])

    assert result.total_concerts == 0
    assert result.date_first is None
    assert result.date_last is None
    assert result.spending.total_spent_excluding_cancelled == Decimal("0.00")
    assert result.projection.compared_concerts == 0
    assert result.rankings == {"combined": ()}


def test_cloud_totals_and_historical_rank_order_match_stage_zero_fixtures() -> None:
    rankings = json.loads(Path("docs/baseline/cloud-rankings.json").read_text())
    expected_stats = json.loads(Path("docs/baseline/cloud-stats.json").read_text())
    rows = [
        AnalyticsConcert(
            concert_id=f"legacy-{index}",
            artist=row["artist"],
            concert_date=date.fromisoformat(row["date"]),
            venue="Legacy venue",
            status="Attended",
            price=Decimal(str(row["price"])),
            genre="Legacy",
            projected_rating=Decimal(str(row["projected"]))
            if row["projected"] is not None
            else None,
            member_ratings={"nhihad": Decimal(str(row["realized"]))},
            combined_rating=Decimal(str(row["realized"])),
        )
        for index, row in enumerate(rankings)
    ]
    rows.extend(
        [
            concert(
                "j-cole",
                "J Cole",
                date(2026, 7, 28),
                status="Want to Go",
                price="130",
            ),
            concert(
                "cancelled",
                "Cancelled",
                date(2020, 1, 1),
                status="Cancelled",
                price="999",
            ),
        ]
    )

    result = calculate_analytics(rows)
    combined_order = [
        (row.artist, row.concert_date.isoformat()) for row in result.rankings["combined"]
    ]
    fixture_order = [(row["artist"], row["date"]) for row in rankings]

    assert result.total_concerts == expected_stats["totalConcerts"]
    assert result.status_counts == expected_stats["statusCounts"]
    assert (
        float(result.spending.total_spent_excluding_cancelled)
        == expected_stats["totalSpentExcludingCancelled"]
    )
    assert result.rating_summaries[0].rated_concerts == expected_stats["ratedConcerts"]
    assert (
        float(result.rating_summaries[0].average_rating) == expected_stats["averageRealizedRating"]
    )
    assert result.date_first.isoformat() == expected_stats["dateRange"]["first"]
    assert result.date_last.isoformat() == expected_stats["dateRange"]["last"]
    assert combined_order == fixture_order
