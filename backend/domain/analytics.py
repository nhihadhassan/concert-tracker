from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Callable

from backend.domain.ratings import round_decimal


@dataclass(frozen=True)
class AnalyticsConcert:
    concert_id: str
    artist: str
    concert_date: date
    venue: str
    status: str
    price: Decimal | None = None
    genre: str | None = None
    projected_rating: Decimal | None = None
    member_ratings: Mapping[str, Decimal | None] = field(default_factory=dict)
    combined_rating: Decimal | None = None
    ranking_tiebreaker: int | None = None


@dataclass(frozen=True)
class SpendingSummary:
    total_spent_excluding_cancelled: Decimal
    attended_spent: Decimal
    upcoming_committed: Decimal
    priced_concerts: int
    average_attended_ticket: Decimal | None


@dataclass(frozen=True)
class RatingSummary:
    scope: str
    rated_concerts: int
    average_rating: Decimal | None


@dataclass(frozen=True)
class ProjectionSummary:
    compared_concerts: int
    mean_absolute_error: Decimal | None
    root_mean_square_error: Decimal | None
    bias: Decimal | None
    within_one_point_percent: Decimal | None


@dataclass(frozen=True)
class YearlyTrend:
    year: int
    concerts: int
    attended: int
    total_spent: Decimal
    average_combined_rating: Decimal | None


@dataclass(frozen=True)
class MonthlyTrend:
    year: int
    month: int
    concerts: int
    attended: int


@dataclass(frozen=True)
class WeekdaySummary:
    weekday: str
    count: int


@dataclass(frozen=True)
class GroupSummary:
    key: str
    concerts: int
    attended: int
    total_spent: Decimal
    average_combined_rating: Decimal | None


@dataclass(frozen=True)
class RankingEntry:
    rank: int
    concert_id: str
    artist: str
    concert_date: date
    rating: Decimal


@dataclass(frozen=True)
class AnalyticsResult:
    total_concerts: int
    status_counts: Mapping[str, int]
    date_first: date | None
    date_last: date | None
    spending: SpendingSummary
    rating_summaries: tuple[RatingSummary, ...]
    projection: ProjectionSummary
    yearly_trends: tuple[YearlyTrend, ...]
    monthly_trends: tuple[MonthlyTrend, ...]
    most_attended_weekday: WeekdaySummary | None
    artist_summaries: tuple[GroupSummary, ...]
    genre_summaries: tuple[GroupSummary, ...]
    venue_summaries: tuple[GroupSummary, ...]
    repeat_artists: tuple[GroupSummary, ...]
    rankings: Mapping[str, tuple[RankingEntry, ...]]


def _money(value: Decimal) -> Decimal:
    return round_decimal(value, 2)


def _metric_mean(values: Iterable[Decimal]) -> Decimal | None:
    items = list(values)
    if not items:
        return None
    return round_decimal(sum(items, Decimal("0")) / Decimal(len(items)), 2)


def _display_artist(value: str) -> str:
    return re.sub(r"\s+20\d{2}$", "", value.strip(), flags=re.IGNORECASE)


def _display_venue(value: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", value.strip())


def _display_genre(value: str | None) -> str:
    return value.strip() if value and value.strip() else "Unspecified"


def _group_summaries(
    concerts: list[AnalyticsConcert],
    display_key: Callable[[AnalyticsConcert], str],
) -> tuple[GroupSummary, ...]:
    grouped: dict[str, list[AnalyticsConcert]] = defaultdict(list)
    display_names: dict[str, str] = {}
    for concert in concerts:
        display = display_key(concert)
        normalized = display.casefold()
        grouped[normalized].append(concert)
        display_names.setdefault(normalized, display)

    rows = []
    for normalized, items in grouped.items():
        ratings = [item.combined_rating for item in items if item.combined_rating is not None]
        rows.append(
            GroupSummary(
                key=display_names[normalized],
                concerts=len(items),
                attended=sum(item.status == "Attended" for item in items),
                total_spent=_money(
                    sum(
                        (
                            item.price
                            for item in items
                            if item.price is not None and item.status != "Cancelled"
                        ),
                        Decimal("0"),
                    )
                ),
                average_combined_rating=_metric_mean(ratings),
            )
        )
    return tuple(sorted(rows, key=lambda row: (-row.concerts, row.key.casefold())))


def _build_rankings(
    concerts: list[AnalyticsConcert], member_ids: list[str]
) -> Mapping[str, tuple[RankingEntry, ...]]:
    scopes = ["combined", *member_ids]
    rankings: dict[str, tuple[RankingEntry, ...]] = {}
    for scope in scopes:
        rated = []
        for concert in concerts:
            rating = (
                concert.combined_rating
                if scope == "combined"
                else concert.member_ratings.get(scope)
            )
            if rating is not None:
                rated.append((concert, rating))
        rated.sort(
            key=lambda item: (
                -item[1],
                item[0].ranking_tiebreaker if item[0].ranking_tiebreaker is not None else 2**31,
            )
        )
        rankings[scope] = tuple(
            RankingEntry(
                rank=index,
                concert_id=concert.concert_id,
                artist=concert.artist,
                concert_date=concert.concert_date,
                rating=rating,
            )
            for index, (concert, rating) in enumerate(rated, start=1)
        )
    return rankings


def calculate_analytics(concerts: Iterable[AnalyticsConcert]) -> AnalyticsResult:
    rows = list(concerts)
    member_ids = sorted({member_id for row in rows for member_id in row.member_ratings})
    status_counts = dict(Counter(row.status for row in rows))
    dates = [row.concert_date for row in rows]

    non_cancelled_prices = [
        row.price for row in rows if row.price is not None and row.status != "Cancelled"
    ]
    attended_prices = [
        row.price for row in rows if row.price is not None and row.status == "Attended"
    ]
    upcoming_prices = [
        row.price for row in rows if row.price is not None and row.status == "Want to Go"
    ]
    spending = SpendingSummary(
        total_spent_excluding_cancelled=_money(sum(non_cancelled_prices, Decimal("0"))),
        attended_spent=_money(sum(attended_prices, Decimal("0"))),
        upcoming_committed=_money(sum(upcoming_prices, Decimal("0"))),
        priced_concerts=len(non_cancelled_prices),
        average_attended_ticket=_money(
            sum(attended_prices, Decimal("0")) / Decimal(len(attended_prices))
        )
        if attended_prices
        else None,
    )

    rating_summaries = [
        RatingSummary(
            scope="combined",
            rated_concerts=sum(row.combined_rating is not None for row in rows),
            average_rating=_metric_mean(
                row.combined_rating for row in rows if row.combined_rating is not None
            ),
        )
    ]
    for member_id in member_ids:
        values = [
            row.member_ratings[member_id]
            for row in rows
            if row.member_ratings.get(member_id) is not None
        ]
        rating_summaries.append(
            RatingSummary(
                scope=member_id,
                rated_concerts=len(values),
                average_rating=_metric_mean(values),
            )
        )

    projection_errors = [
        row.combined_rating - row.projected_rating
        for row in rows
        if row.combined_rating is not None and row.projected_rating is not None
    ]
    if projection_errors:
        mean_square = sum((error * error for error in projection_errors), Decimal("0")) / Decimal(
            len(projection_errors)
        )
        projection = ProjectionSummary(
            compared_concerts=len(projection_errors),
            mean_absolute_error=_metric_mean(abs(error) for error in projection_errors),
            root_mean_square_error=round_decimal(mean_square.sqrt(), 2),
            bias=_metric_mean(projection_errors),
            within_one_point_percent=round_decimal(
                Decimal(sum(abs(error) <= 1 for error in projection_errors))
                / Decimal(len(projection_errors))
                * Decimal("100"),
                1,
            ),
        )
    else:
        projection = ProjectionSummary(0, None, None, None, None)

    by_year: dict[int, list[AnalyticsConcert]] = defaultdict(list)
    for row in rows:
        by_year[row.concert_date.year].append(row)
    yearly_trends = tuple(
        YearlyTrend(
            year=year,
            concerts=len(items),
            attended=sum(item.status == "Attended" for item in items),
            total_spent=_money(
                sum(
                    (
                        item.price
                        for item in items
                        if item.price is not None and item.status != "Cancelled"
                    ),
                    Decimal("0"),
                )
            ),
            average_combined_rating=_metric_mean(
                item.combined_rating for item in items if item.combined_rating is not None
            ),
        )
        for year, items in sorted(by_year.items())
    )

    by_month: dict[tuple[int, int], list[AnalyticsConcert]] = defaultdict(list)
    for row in rows:
        by_month[(row.concert_date.year, row.concert_date.month)].append(row)
    monthly_trends = tuple(
        MonthlyTrend(
            year=year,
            month=month,
            concerts=len(items),
            attended=sum(item.status == "Attended" for item in items),
        )
        for (year, month), items in sorted(by_month.items())
    )

    weekday_order = (
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    )
    attended_weekdays = Counter(
        row.concert_date.strftime("%A") for row in rows if row.status == "Attended"
    )
    most_attended_weekday = None
    if attended_weekdays:
        highest_count = max(attended_weekdays.values())
        most_attended_weekday = WeekdaySummary(
            weekday=next(
                weekday for weekday in weekday_order if attended_weekdays[weekday] == highest_count
            ),
            count=highest_count,
        )

    artist_summaries = _group_summaries(rows, lambda row: _display_artist(row.artist))
    genre_summaries = _group_summaries(rows, lambda row: _display_genre(row.genre))
    venue_summaries = _group_summaries(rows, lambda row: _display_venue(row.venue))

    return AnalyticsResult(
        total_concerts=len(rows),
        status_counts=status_counts,
        date_first=min(dates) if dates else None,
        date_last=max(dates) if dates else None,
        spending=spending,
        rating_summaries=tuple(rating_summaries),
        projection=projection,
        yearly_trends=yearly_trends,
        monthly_trends=monthly_trends,
        most_attended_weekday=most_attended_weekday,
        artist_summaries=artist_summaries,
        genre_summaries=genre_summaries,
        venue_summaries=venue_summaries,
        repeat_artists=tuple(row for row in artist_summaries if row.concerts > 1),
        rankings=_build_rankings(rows, member_ids),
    )
