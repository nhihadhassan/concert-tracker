from datetime import date
from decimal import Decimal
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RatingRuleResponse(BaseModel):
    version: int
    weights: Dict[str, float]
    rounds_to: int
    maximum_rating: float
    renormalize_missing: bool


class ReviewCalculationInput(StrictInput):
    reviewer_user_id: str = Field(min_length=1, max_length=100)
    reviewer_name: Optional[str] = Field(default=None, max_length=100)
    enjoyment_score: Optional[Decimal] = Field(default=None, ge=0)
    stage_score: Optional[Decimal] = Field(default=None, ge=0)
    setlist_score: Optional[Decimal] = Field(default=None, ge=0)
    seat_score: Optional[Decimal] = Field(default=None, ge=0)
    performance_score: Optional[Decimal] = Field(default=None, ge=0)
    override_rating: Optional[Decimal] = Field(default=None, ge=0)
    override_reason: Optional[str] = Field(default=None, max_length=500)


class ReviewRatingResponse(BaseModel):
    reviewer_user_id: str
    reviewer_name: Optional[str]
    rule_version: int
    uncapped_rating: Optional[float]
    calculated_rating: Optional[float]
    override_rating: Optional[float]
    final_rating: Optional[float]
    override_reason: Optional[str]
    is_overridden: bool
    present_components: List[str]
    missing_components: List[str]


class RatingCalculationRequest(StrictInput):
    reviews: List[ReviewCalculationInput] = Field(default_factory=list, max_length=20)


class RatingCalculationResponse(BaseModel):
    rule: RatingRuleResponse
    reviews: List[ReviewRatingResponse]
    combined_rating: Optional[float]


class AnalyticsConcertInput(StrictInput):
    concert_id: str = Field(min_length=1, max_length=100)
    artist: str = Field(min_length=1, max_length=200)
    concert_date: date
    venue: str = Field(min_length=1, max_length=300)
    status: Literal["Want to Go", "Attended", "Cancelled"]
    price: Optional[Decimal] = Field(default=None, ge=0)
    genre: Optional[str] = Field(default=None, max_length=100)
    projected_rating: Optional[Decimal] = Field(default=None, ge=0)
    reviews: List[ReviewCalculationInput] = Field(default_factory=list, max_length=20)


class AnalyticsCalculationRequest(StrictInput):
    concerts: List[AnalyticsConcertInput] = Field(default_factory=list, max_length=5000)


class ConcertRatingResponse(BaseModel):
    concert_id: str
    artist: str
    concert_date: date
    reviews: List[ReviewRatingResponse]
    combined_rating: Optional[float]


class SpendingResponse(BaseModel):
    total_spent_excluding_cancelled: float
    attended_spent: float
    upcoming_committed: float
    priced_concerts: int
    average_attended_ticket: Optional[float]
    median_attended_ticket: Optional[float]


class RatingSummaryResponse(BaseModel):
    scope: str
    rated_concerts: int
    average_rating: Optional[float]


class ProjectionResponse(BaseModel):
    compared_concerts: int
    mean_absolute_error: Optional[float]
    root_mean_square_error: Optional[float]
    bias: Optional[float]
    within_one_point_percent: Optional[float]


class YearlyTrendResponse(BaseModel):
    year: int
    concerts: int
    attended: int
    total_spent: float
    average_combined_rating: Optional[float]


class MonthlyTrendResponse(BaseModel):
    year: int
    month: int
    concerts: int
    attended: int


class WeekdaySummaryResponse(BaseModel):
    weekday: str
    count: int


class GroupSummaryResponse(BaseModel):
    key: str
    concerts: int
    attended: int
    total_spent: float
    average_combined_rating: Optional[float]


class RankingEntryResponse(BaseModel):
    rank: int
    concert_id: str
    artist: str
    concert_date: date
    rating: float


class AnalyticsResponse(BaseModel):
    total_concerts: int
    status_counts: Dict[str, int]
    date_first: Optional[date]
    date_last: Optional[date]
    spending: SpendingResponse
    rating_summaries: List[RatingSummaryResponse]
    projection: ProjectionResponse
    yearly_trends: List[YearlyTrendResponse]
    monthly_trends: List[MonthlyTrendResponse]
    most_attended_weekday: Optional[WeekdaySummaryResponse]
    artist_summaries: List[GroupSummaryResponse]
    genre_summaries: List[GroupSummaryResponse]
    venue_summaries: List[GroupSummaryResponse]
    repeat_artists: List[GroupSummaryResponse]
    rankings: Dict[str, List[RankingEntryResponse]]


class AnalyticsCalculationResponse(BaseModel):
    rule: RatingRuleResponse
    concert_ratings: List[ConcertRatingResponse]
    analytics: AnalyticsResponse
