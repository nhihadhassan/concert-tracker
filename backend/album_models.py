from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictAlbumInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SpotifyAlbumOption(BaseModel):
    spotify_album_id: str
    title: str
    artist: str
    release_date: Optional[str]
    album_type: str
    total_tracks: int
    image_url: Optional[str]
    spotify_url: Optional[str]


class SpotifyAlbumSearchResponse(BaseModel):
    results: List[SpotifyAlbumOption]


class AlbumTrackResponse(BaseModel):
    id: str
    spotify_track_id: str
    title: str
    disc_number: int
    track_number: int
    duration_ms: int
    explicit: bool
    spotify_url: Optional[str]


class AlbumTrackReviewResponse(BaseModel):
    id: str
    album_track_id: str
    personal_rank: Optional[int]
    score: Optional[float]
    notes: Optional[str]
    row_version: int


class AlbumReviewResponse(BaseModel):
    id: str
    reviewer_user_id: str
    reviewer_name: str
    overall_score: Optional[float]
    review_markdown: Optional[str]
    status: Literal["draft", "published"]
    published_at: Optional[str]
    updated_at: str
    row_version: int
    track_reviews: List[AlbumTrackReviewResponse]


class AlbumResponse(BaseModel):
    id: str
    spotify_album_id: str
    title: str
    artist: str
    album_type: str
    release_date: Optional[str]
    release_date_precision: Optional[Literal["year", "month", "day"]]
    image_url: Optional[str]
    spotify_url: Optional[str]
    label: Optional[str]
    genres: List[str]
    total_tracks: int
    duration_ms: int
    row_version: int
    tracks: List[AlbumTrackResponse]
    reviews: List[AlbumReviewResponse]


class AlbumLibraryResponse(BaseModel):
    albums: List[AlbumResponse]


class AlbumImportWrite(StrictAlbumInput):
    id: UUID
    spotify_album_id: str = Field(min_length=1, max_length=100)


class AlbumTrackReviewWrite(StrictAlbumInput):
    id: UUID
    album_track_id: UUID
    personal_rank: Optional[int] = Field(default=None, ge=1)
    score: Optional[float] = Field(default=None, ge=0, le=10)
    notes: Optional[str] = Field(default=None, max_length=1000)


class AlbumReviewWrite(StrictAlbumInput):
    id: UUID
    expected_row_version: Optional[int] = Field(default=None, ge=1)
    overall_score: Optional[float] = Field(default=None, ge=0, le=10)
    review_markdown: Optional[str] = Field(default=None, max_length=50000)
    status: Literal["draft", "published"] = "draft"
    track_reviews: List[AlbumTrackReviewWrite] = Field(default_factory=list, max_length=300)

    @model_validator(mode="after")
    def validate_review(self) -> "AlbumReviewWrite":
        body = self.review_markdown.strip() if self.review_markdown else None
        if self.status == "published" and not body:
            raise ValueError("A published review needs written content")
        ranks = [row.personal_rank for row in self.track_reviews if row.personal_rank is not None]
        if len(ranks) != len(set(ranks)):
            raise ValueError("Personal track ranks must be unique")
        track_ids = [row.album_track_id for row in self.track_reviews]
        if len(track_ids) != len(set(track_ids)):
            raise ValueError("Each album track can appear only once")
        self.review_markdown = body
        return self


class AlbumMutationResponse(BaseModel):
    album_id: str
    review_id: Optional[str] = None
    resource_row_version: int
    replayed: bool = False
    message: str
