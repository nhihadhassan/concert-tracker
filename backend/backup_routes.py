"""Preview and restore the browser JSON backup without silently replacing data."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.identity import PublicUser, current_user
from backend.library_routes import _member_rows, _translate_rest, build_library
from backend.supabase_rest import SupabaseRestClient, SupabaseRestError, get_rest_client

router = APIRouter(prefix="/v1/backups", tags=["backups"])


class InputModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class BackupAttendee(InputModel):
    user_id: UUID
    attendance_status: Literal["Planned", "Attended", "Did Not Attend"]


class BackupReview(InputModel):
    id: Optional[UUID] = None
    reviewer_user_id: UUID
    enjoyment_score: Optional[float] = Field(default=None, ge=0)
    stage_score: Optional[float] = Field(default=None, ge=0)
    setlist_score: Optional[float] = Field(default=None, ge=0)
    seat_score: Optional[float] = Field(default=None, ge=0)
    performance_score: Optional[float] = Field(default=None, ge=0)
    override_rating: Optional[float] = Field(default=None, ge=0, le=10)
    override_reason: Optional[str] = None
    notes: Optional[str] = None


class BackupConcert(InputModel):
    id: UUID
    artist: str = Field(min_length=1, max_length=200)
    tour: Optional[str] = None
    date: date
    venue: str = Field(min_length=1, max_length=300)
    price: Optional[float] = Field(default=None, ge=0)
    genre: Optional[str] = None
    projected: Optional[float] = Field(default=None, ge=0)
    seat: Optional[str] = None
    status: Literal["Want to Go", "Attended", "Cancelled"]
    type: str = "Concert"
    setlist_url: Optional[str] = None
    spotify_url: Optional[str] = None
    image: Optional[str] = None
    notes: Optional[str] = None
    companions: Optional[str] = None
    attendees: list[BackupAttendee] = Field(default_factory=list)
    reviews: list[BackupReview] = Field(default_factory=list)


class BackupEnvelope(InputModel):
    format: Literal["encore-concert-backup"]
    version: Literal[1]
    exported_at: str
    concerts: list[BackupConcert] = Field(max_length=1000)


class PreviewRequest(InputModel):
    backup: BackupEnvelope


class PreviewItem(BaseModel):
    key: str
    artist: str
    date: str
    venue: str
    status: Literal["new", "duplicate", "conflict", "invalid"]
    target_id: Optional[str] = None
    differences: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class BackupPreviewResponse(BaseModel):
    backup_hash: str
    revision_hash: str
    items: list[PreviewItem]
    summary: dict[str, int]


class ConflictResolution(InputModel):
    key: str
    action: Literal["keep_existing", "use_backup"]


class RestoreRequest(InputModel):
    backup: BackupEnvelope
    backup_hash: str
    revision_hash: str
    resolutions: list[ConflictResolution] = Field(default_factory=list, max_length=1000)


class BackupRestoreResponse(BaseModel):
    restored: int
    skipped_duplicates: int
    kept_conflicts: int
    message: str


def _stable_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def _artist_key(value: str) -> str:
    cleaned = re.sub(r"\s+20\d{2}$", "", value.strip(), flags=re.IGNORECASE)
    return " ".join(re.findall(r"[a-z0-9]+", cleaned.casefold().replace("$", "s")))


def _venue_key(value: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", value).strip().casefold()


def _natural_key(row: BackupConcert | Any) -> tuple[str, str, str]:
    return (_artist_key(str(row.artist)), str(row.date), _venue_key(str(row.venue)))


def _review_payload(review: Any) -> dict[str, Any]:
    return {
        "id": str(review.id) if getattr(review, "id", None) else None,
        "reviewer_user_id": str(review.reviewer_user_id),
        "enjoyment_score": review.enjoyment_score,
        "stage_score": review.stage_score,
        "setlist_score": review.setlist_score,
        "seat_score": review.seat_score,
        "performance_score": review.performance_score,
        "override_rating": review.override_rating,
        "override_reason": review.override_reason,
        "notes": review.notes,
    }


def _concert_payload(row: BackupConcert | Any) -> dict[str, Any]:
    return {
        "artist": row.artist,
        "tour": row.tour,
        "date": str(row.date),
        "venue": row.venue,
        "price": row.price,
        "genre": row.genre,
        "projected": row.projected,
        "seat": row.seat,
        "status": row.status,
        "type": row.type,
        "setlist_url": getattr(row, "setlist_url", None),
        "spotify_url": row.spotify_url,
        "image": row.image,
        "notes": row.notes,
        "companions": row.companions,
    }


def _restorable(row: BackupConcert | Any) -> dict[str, Any]:
    return {
        "concert": _concert_payload(row),
        "attendees": sorted(
            [
                {"user_id": str(item.user_id), "attendance_status": item.attendance_status}
                for item in row.attendees
            ],
            key=lambda item: item["user_id"],
        ),
        "reviews": sorted(
            [_review_payload(item) for item in row.reviews],
            key=lambda item: item["reviewer_user_id"],
        ),
    }


def _differences(backup: BackupConcert, current: Any) -> list[str]:
    before, after = _restorable(backup), _restorable(current)
    fields = [key for key, value in before["concert"].items() if value != after["concert"].get(key)]
    if before["attendees"] != after["attendees"]:
        fields.append("attendance")
    if before["reviews"] != after["reviews"]:
        fields.append("reviews")
    return fields


def _preview(
    backup: BackupEnvelope, library: Any, members: list[dict[str, Any]]
) -> BackupPreviewResponse:
    by_id = {str(row.id): row for row in library.concerts}
    by_natural: dict[tuple[str, str, str], list[Any]] = {}
    for concert in library.concerts:
        by_natural.setdefault(_natural_key(concert), []).append(concert)
    member_ids = {str(row["user_id"]) for row in members}
    items: list[PreviewItem] = []
    for concert in backup.concerts:
        current = by_id.get(str(concert.id))
        if current is None:
            natural_matches = by_natural.get(_natural_key(concert), [])
            current = natural_matches[0] if len(natural_matches) == 1 else None
        warnings = []
        missing_people = {
            *[str(row.user_id) for row in concert.attendees],
            *[str(row.reviewer_user_id) for row in concert.reviews],
        } - member_ids
        if missing_people:
            warnings.append(f"{len(missing_people)} unavailable member record(s) will be skipped")
        if current is None:
            item_status: Literal["new", "duplicate", "conflict", "invalid"] = "new"
            differences: list[str] = []
            target_id = None
        else:
            differences = _differences(concert, current)
            item_status = "conflict" if differences else "duplicate"
            target_id = str(current.id)
        items.append(
            PreviewItem(
                key=str(concert.id),
                artist=concert.artist,
                date=str(concert.date),
                venue=concert.venue,
                status=item_status,
                target_id=target_id,
                differences=differences,
                warnings=warnings,
            )
        )
    summary = {
        name: sum(item.status == name for item in items)
        for name in ("new", "duplicate", "conflict", "invalid")
    }
    summary["warnings"] = sum(bool(item.warnings) for item in items)
    return BackupPreviewResponse(
        backup_hash=_stable_hash(backup.model_dump(mode="json")),
        revision_hash=_stable_hash([_restorable(row) for row in library.concerts]),
        items=items,
        summary=summary,
    )


def _read_replay(
    rest: SupabaseRestClient, user_id: str, key: UUID, request_hash: str
) -> Optional[BackupRestoreResponse]:
    rows = rest.select(
        "api_idempotency_keys",
        params={
            "select": "request_hash,response_body",
            "user_id": f"eq.{user_id}",
            "idempotency_key": f"eq.{key}",
            "limit": 1,
        },
    )
    if not rows:
        return None
    if rows[0]["request_hash"] != request_hash:
        raise HTTPException(
            status_code=409, detail="This restore key was already used for different data."
        )
    return BackupRestoreResponse.model_validate(rows[0]["response_body"])


@router.post("/preview", response_model=BackupPreviewResponse)
def preview_backup(
    payload: PreviewRequest,
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> BackupPreviewResponse:
    try:
        return _preview(payload.backup, build_library(rest, str(user.user_id)), _member_rows(rest))
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.post("/restore", response_model=BackupRestoreResponse)
def restore_backup(
    payload: RestoreRequest,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> BackupRestoreResponse:
    request_hash = _stable_hash(payload.model_dump(mode="json"))
    try:
        replay = _read_replay(rest, str(user.user_id), idempotency_key, request_hash)
        if replay:
            return replay
        members = _member_rows(rest)
        library = build_library(rest, str(user.user_id))
        preview = _preview(payload.backup, library, members)
        if (
            preview.backup_hash != payload.backup_hash
            or preview.revision_hash != payload.revision_hash
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "The archive changed after preview. Review the backup again before restoring."
                ),
            )
        decisions = {row.key: row.action for row in payload.resolutions}
        by_key = {str(row.id): row for row in payload.backup.concerts}
        active_members = {str(row["user_id"]) for row in members}
        records = []
        kept_conflicts = 0
        for item in preview.items:
            if item.status == "duplicate":
                continue
            if (
                item.status == "conflict"
                and decisions.get(item.key, "keep_existing") != "use_backup"
            ):
                kept_conflicts += 1
                continue
            concert = by_key[item.key]
            record = _restorable(concert)
            record["concert"]["id"] = str(concert.id)
            record["target_id"] = item.target_id if item.status == "conflict" else None
            record["attendees"] = [
                row for row in record["attendees"] if row["user_id"] in active_members
            ]
            record["reviews"] = [
                row for row in record["reviews"] if row["reviewer_user_id"] in active_members
            ]
            records.append(record)
        rpc_result = rest.rpc(
            "restore_encore_backup",
            {
                "payload": {"records": records},
                "actor_id": str(user.user_id),
                "mutation_id": str(idempotency_key),
            },
        )
        if isinstance(rpc_result, list):
            rpc_result = rpc_result[0] if rpc_result else {}
        result = BackupRestoreResponse(
            restored=int((rpc_result or {}).get("restored", 0)),
            skipped_duplicates=preview.summary["duplicate"],
            kept_conflicts=kept_conflicts,
            message="Backup restore completed without deleting current-only records.",
        )
        rest.insert(
            "api_idempotency_keys",
            {
                "user_id": str(user.user_id),
                "idempotency_key": str(idempotency_key),
                "request_method": "POST",
                "request_path": "/v1/backups/restore",
                "request_hash": request_hash,
                "response_status": 200,
                "response_body": result.model_dump(mode="json"),
            },
        )
        return result
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc
