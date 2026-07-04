from datetime import date
from typing import Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.api_models import AnalyticsResponse


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MemberSummary(BaseModel):
    user_id: str
    email: str
    display_name: str


class AttendeeResponse(BaseModel):
    user_id: str
    display_name: str
    attendance_status: Literal["Planned", "Attended", "Did Not Attend"]
    row_version: int


class ReviewResponse(BaseModel):
    id: str
    reviewer_user_id: str
    reviewer_name: str
    enjoyment_score: Optional[float]
    stage_score: Optional[float]
    setlist_score: Optional[float]
    seat_score: Optional[float]
    override_rating: Optional[float]
    override_reason: Optional[str]
    notes: Optional[str]
    calculated_rating: Optional[float]
    final_rating: Optional[float]
    is_overridden: bool
    row_version: int


class ConcertResponse(BaseModel):
    id: str
    artist: str
    tour: Optional[str]
    date: date
    venue: str
    price: Optional[float]
    genre: Optional[str]
    projected: Optional[float]
    seat: Optional[str]
    status: Literal["Want to Go", "Attended", "Cancelled"]
    type: str
    spotify_url: Optional[str]
    image: Optional[str]
    notes: Optional[str]
    companions: Optional[str]
    row_version: int
    attendees: List[AttendeeResponse]
    reviews: List[ReviewResponse]
    personal_rating: Optional[float]
    combined_rating: Optional[float]


class LibraryResponse(BaseModel):
    members: List[MemberSummary]
    concerts: List[ConcertResponse]
    analytics: AnalyticsResponse
    personal_analytics: AnalyticsResponse


class ReviewWrite(StrictInput):
    id: UUID
    expected_row_version: Optional[int] = Field(default=None, ge=1)
    enjoyment_score: Optional[float] = Field(default=None, ge=0)
    stage_score: Optional[float] = Field(default=None, ge=0)
    setlist_score: Optional[float] = Field(default=None, ge=0)
    seat_score: Optional[float] = Field(default=None, ge=0)
    override_rating: Optional[float] = Field(default=None, ge=0, le=10)
    override_reason: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_override(self) -> "ReviewWrite":
        reason = self.override_reason.strip() if self.override_reason else None
        if self.override_rating is not None and not reason:
            raise ValueError("override_reason is required when override_rating is set")
        if self.override_rating is None and reason:
            raise ValueError("override_rating is required when override_reason is set")
        self.override_reason = reason
        return self


class ConcertFields(StrictInput):
    artist: str = Field(min_length=1, max_length=200)
    tour: Optional[str] = Field(default=None, max_length=300)
    date: date
    venue: str = Field(min_length=1, max_length=300)
    price: Optional[float] = Field(default=None, ge=0)
    genre: Optional[str] = Field(default=None, max_length=100)
    projected: Optional[float] = Field(default=None, ge=0)
    seat: Optional[str] = Field(default=None, max_length=300)
    status: Literal["Want to Go", "Attended", "Cancelled"]
    type: str = Field(default="Concert", min_length=1, max_length=100)
    spotify_url: Optional[str] = Field(default=None, max_length=2000)
    image: Optional[str] = Field(default=None, max_length=4000)
    notes: Optional[str] = Field(default=None, max_length=4000)
    companions: Optional[str] = Field(default=None, max_length=1000)


class ConcertCreate(ConcertFields):
    id: UUID
    attendee_user_ids: List[UUID] = Field(default_factory=list, max_length=10)
    review: Optional[ReviewWrite] = None


class ConcertUpdate(ConcertFields):
    expected_row_version: int = Field(ge=1)


class AttendanceWrite(StrictInput):
    attendee_user_ids: List[UUID] = Field(default_factory=list, max_length=10)
    expected_versions: Dict[str, int] = Field(default_factory=dict)


class MutationResponse(BaseModel):
    concert_id: str
    resource_row_version: int
    replayed: bool = False
    message: str
