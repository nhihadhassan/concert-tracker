from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from backend.api_models import (
    AnalyticsCalculationRequest,
    AnalyticsCalculationResponse,
    AnalyticsResponse,
    ConcertRatingResponse,
    GroupSummaryResponse,
    MonthlyTrendResponse,
    ProjectionResponse,
    RankingEntryResponse,
    RatingCalculationRequest,
    RatingCalculationResponse,
    RatingRuleResponse,
    RatingSummaryResponse,
    ReviewCalculationInput,
    ReviewRatingResponse,
    SpendingResponse,
    WeekdaySummaryResponse,
    YearlyTrendResponse,
)
from backend.domain.analytics import (
    AnalyticsConcert,
    AnalyticsResult,
    GroupSummary,
    calculate_analytics,
)
from backend.domain.ratings import (
    DEFAULT_RATING_RULE,
    RatingResult,
    RatingRule,
    RatingValidationError,
    ReviewScores,
    calculate_rating,
    combine_final_ratings,
)

router = APIRouter(prefix="/v1", tags=["calculations"])


def optional_float(value: Optional[Decimal]) -> Optional[float]:
    return float(value) if value is not None else None


def rule_response(rule: RatingRule) -> RatingRuleResponse:
    return RatingRuleResponse(
        version=rule.version,
        weights={name: float(value) for name, value in rule.normalized_weights.items()},
        rounds_to=rule.rounds_to,
        maximum_rating=float(rule.maximum_rating),
        renormalize_missing=rule.renormalize_missing,
    )


def review_response(review: ReviewCalculationInput, result: RatingResult) -> ReviewRatingResponse:
    return ReviewRatingResponse(
        reviewer_user_id=review.reviewer_user_id,
        reviewer_name=review.reviewer_name,
        rule_version=result.rule_version,
        uncapped_rating=optional_float(result.uncapped_rating),
        calculated_rating=optional_float(result.calculated_rating),
        override_rating=optional_float(result.override_rating),
        final_rating=optional_float(result.final_rating),
        override_reason=result.override_reason,
        is_overridden=result.is_overridden,
        present_components=list(result.present_components),
        missing_components=list(result.missing_components),
    )


def calculate_review_set(
    reviews: list[ReviewCalculationInput], rule: RatingRule
) -> tuple[list[ReviewRatingResponse], dict[str, Optional[Decimal]], Optional[Decimal]]:
    reviewer_ids = [review.reviewer_user_id for review in reviews]
    if len(reviewer_ids) != len(set(reviewer_ids)):
        raise RatingValidationError("reviewer_user_id must be unique within a concert")

    responses = []
    final_ratings: dict[str, Optional[Decimal]] = {}
    for review in reviews:
        result = calculate_rating(
            ReviewScores(
                enjoyment=review.enjoyment_score,
                stage=review.stage_score,
                setlist=review.setlist_score,
                seat=review.seat_score,
            ),
            override_rating=review.override_rating,
            override_reason=review.override_reason,
            rule=rule,
        )
        responses.append(review_response(review, result))
        final_ratings[review.reviewer_user_id] = result.final_rating
    combined = combine_final_ratings(list(final_ratings.values()), rule=rule)
    return responses, final_ratings, combined


def group_response(row: GroupSummary) -> GroupSummaryResponse:
    return GroupSummaryResponse(
        key=row.key,
        concerts=row.concerts,
        attended=row.attended,
        total_spent=float(row.total_spent),
        average_combined_rating=optional_float(row.average_combined_rating),
    )


def analytics_response(result: AnalyticsResult) -> AnalyticsResponse:
    return AnalyticsResponse(
        total_concerts=result.total_concerts,
        status_counts=dict(result.status_counts),
        date_first=result.date_first,
        date_last=result.date_last,
        spending=SpendingResponse(
            total_spent_excluding_cancelled=float(result.spending.total_spent_excluding_cancelled),
            attended_spent=float(result.spending.attended_spent),
            upcoming_committed=float(result.spending.upcoming_committed),
            priced_concerts=result.spending.priced_concerts,
            average_attended_ticket=optional_float(result.spending.average_attended_ticket),
            median_attended_ticket=optional_float(result.spending.median_attended_ticket),
        ),
        rating_summaries=[
            RatingSummaryResponse(
                scope=row.scope,
                rated_concerts=row.rated_concerts,
                average_rating=optional_float(row.average_rating),
            )
            for row in result.rating_summaries
        ],
        projection=ProjectionResponse(
            compared_concerts=result.projection.compared_concerts,
            mean_absolute_error=optional_float(result.projection.mean_absolute_error),
            root_mean_square_error=optional_float(result.projection.root_mean_square_error),
            bias=optional_float(result.projection.bias),
            within_one_point_percent=optional_float(result.projection.within_one_point_percent),
        ),
        yearly_trends=[
            YearlyTrendResponse(
                year=row.year,
                concerts=row.concerts,
                attended=row.attended,
                total_spent=float(row.total_spent),
                average_combined_rating=optional_float(row.average_combined_rating),
            )
            for row in result.yearly_trends
        ],
        monthly_trends=[
            MonthlyTrendResponse(
                year=row.year,
                month=row.month,
                concerts=row.concerts,
                attended=row.attended,
            )
            for row in result.monthly_trends
        ],
        most_attended_weekday=(
            WeekdaySummaryResponse(
                weekday=result.most_attended_weekday.weekday,
                count=result.most_attended_weekday.count,
            )
            if result.most_attended_weekday
            else None
        ),
        artist_summaries=[group_response(row) for row in result.artist_summaries],
        genre_summaries=[group_response(row) for row in result.genre_summaries],
        venue_summaries=[group_response(row) for row in result.venue_summaries],
        repeat_artists=[group_response(row) for row in result.repeat_artists],
        rankings={
            scope: [
                RankingEntryResponse(
                    rank=row.rank,
                    concert_id=row.concert_id,
                    artist=row.artist,
                    concert_date=row.concert_date,
                    rating=float(row.rating),
                )
                for row in rows
            ]
            for scope, rows in result.rankings.items()
        },
    )


def domain_error(exc: RatingValidationError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/rating-rules/current", response_model=RatingRuleResponse)
def current_rating_rule() -> RatingRuleResponse:
    return rule_response(DEFAULT_RATING_RULE)


@router.post("/ratings/calculate", response_model=RatingCalculationResponse)
def calculate_ratings(
    payload: RatingCalculationRequest,
) -> RatingCalculationResponse:
    try:
        rule = DEFAULT_RATING_RULE
        reviews, _, combined = calculate_review_set(payload.reviews, rule)
    except RatingValidationError as exc:
        raise domain_error(exc) from exc
    return RatingCalculationResponse(
        rule=rule_response(rule),
        reviews=reviews,
        combined_rating=optional_float(combined),
    )


@router.post("/analytics/calculate", response_model=AnalyticsCalculationResponse)
def calculate_analytics_endpoint(
    payload: AnalyticsCalculationRequest,
) -> AnalyticsCalculationResponse:
    try:
        rule = DEFAULT_RATING_RULE
        domain_concerts = []
        concert_ratings = []
        for concert in payload.concerts:
            reviews, member_ratings, combined = calculate_review_set(concert.reviews, rule)
            domain_concerts.append(
                AnalyticsConcert(
                    concert_id=concert.concert_id,
                    artist=concert.artist,
                    concert_date=concert.concert_date,
                    venue=concert.venue,
                    status=concert.status,
                    price=concert.price,
                    genre=concert.genre,
                    projected_rating=concert.projected_rating,
                    member_ratings=member_ratings,
                    combined_rating=combined,
                )
            )
            concert_ratings.append(
                ConcertRatingResponse(
                    concert_id=concert.concert_id,
                    artist=concert.artist,
                    concert_date=concert.concert_date,
                    reviews=reviews,
                    combined_rating=optional_float(combined),
                )
            )
        result = calculate_analytics(domain_concerts)
    except RatingValidationError as exc:
        raise domain_error(exc) from exc
    return AnalyticsCalculationResponse(
        rule=rule_response(rule),
        concert_ratings=concert_ratings,
        analytics=analytics_response(result),
    )
