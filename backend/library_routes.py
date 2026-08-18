from __future__ import annotations

import csv
import hashlib
import io
import json
from collections.abc import Mapping
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from backend.api_models import AnalyticsResponse
from backend.calculation_routes import analytics_response
from backend.domain.analytics import AnalyticsConcert, calculate_analytics
from backend.domain.ratings import (
    RatingValidationError,
    ReviewScores,
    calculate_rating,
    combine_final_ratings,
)
from backend.identity import PublicUser, current_user
from backend.library_models import (
    AttendanceWrite,
    AttendeeResponse,
    ConcertCreate,
    ConcertResponse,
    ConcertUpdate,
    LibraryResponse,
    MemberSummary,
    MutationResponse,
    ReviewResponse,
    ReviewWrite,
)
from backend.supabase_rest import (
    SupabaseRestClient,
    SupabaseRestError,
    get_rest_client,
)

router = APIRouter(prefix="/v1", tags=["library"])


def _float(value: Any) -> float | None:
    return float(value) if value is not None else None


def _text(value: str | None) -> str | None:
    if value is None:
        return None
    result = value.strip()
    return result or None


def _translate_rest(exc: SupabaseRestError) -> HTTPException:
    if exc.status_code in {401, 403}:
        return HTTPException(status_code=exc.status_code, detail="Cloud authorization failed")
    if exc.status_code == 409:
        return HTTPException(status_code=409, detail="Cloud record conflict")
    if exc.status_code == 503:
        return HTTPException(status_code=503, detail=exc.message)
    return HTTPException(status_code=502, detail="Cloud data request failed")


def _request_hash(method: str, path: str, payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        {"method": method, "path": path, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _read_replay(
    rest: SupabaseRestClient,
    user_id: str,
    key: UUID,
    request_hash: str,
) -> MutationResponse | None:
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
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "idempotency_key_reused",
                "message": "This queued change key was already used for different data.",
            },
        )
    return MutationResponse.model_validate({**rows[0]["response_body"], "replayed": True})


def _store_replay(
    rest: SupabaseRestClient,
    user_id: str,
    key: UUID,
    method: str,
    path: str,
    request_hash: str,
    response: MutationResponse,
) -> None:
    rest.insert(
        "api_idempotency_keys",
        {
            "user_id": user_id,
            "idempotency_key": str(key),
            "request_method": method,
            "request_path": path,
            "request_hash": request_hash,
            "response_status": 200,
            "response_body": response.model_dump(mode="json"),
        },
    )


def _concert_payload(payload: ConcertCreate | ConcertUpdate) -> dict[str, Any]:
    return {
        "artist": payload.artist.strip(),
        "tour_name": _text(payload.tour),
        "concert_date": payload.date.isoformat(),
        "venue": payload.venue.strip(),
        "price": payload.price,
        "genre": _text(payload.genre),
        "projected_rating": payload.projected,
        "seat": _text(payload.seat),
        "status": payload.status,
        "concert_type": payload.type.strip(),
        "setlist_url": _text(payload.setlist_url),
        "spotify_url": _text(payload.spotify_url),
        "image_url": _text(payload.image),
        "notes": payload.notes if payload.notes and payload.notes.strip() else None,
        "companions": payload.companions
        if payload.companions and payload.companions.strip()
        else None,
    }


def _attendance_status(concert_status: str) -> str:
    return {
        "Attended": "Attended",
        "Want to Go": "Planned",
        "Cancelled": "Did Not Attend",
    }[concert_status]


def _current_rule_id(rest: SupabaseRestClient) -> str:
    rows = rest.select(
        "rating_rule_versions",
        params={
            "select": "id,version",
            "retired_at": "is.null",
            "order": "version.desc",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(status_code=503, detail="No active rating rule is configured")
    return str(rows[0]["id"])


def _member_rows(rest: SupabaseRestClient) -> list[dict[str, Any]]:
    return rest.select(
        "app_members",
        params={
            "select": "user_id,email,display_name",
            "is_active": "eq.true",
            "deleted_at": "is.null",
            "order": "display_name.asc",
        },
    )


def _validate_attendee_ids(
    members: list[dict[str, Any]], attendee_ids: set[str], current_user_id: str
) -> set[str]:
    allowed = {str(row["user_id"]) for row in members}
    desired = attendee_ids | {current_user_id}
    unknown = desired - allowed
    if unknown:
        raise HTTPException(status_code=422, detail="Attendees must be active app members")
    return desired


def _review_result(row: Mapping[str, Any]):
    return calculate_rating(
        ReviewScores(
            row.get("enjoyment_score"),
            row.get("stage_score"),
            row.get("setlist_score"),
            row.get("seat_score"),
        ),
        override_rating=row.get("rating_override"),
        override_reason=row.get("rating_override_reason"),
    )


def build_library(
    rest: SupabaseRestClient,
    current_user_id: str,
) -> LibraryResponse:
    members = _member_rows(rest)
    concerts = rest.select(
        "concerts",
        params={
            "select": "*",
            "deleted_at": "is.null",
            "order": "concert_date.desc,created_at.desc",
        },
    )
    attendees = rest.select(
        "concert_attendees",
        params={"select": "*", "deleted_at": "is.null"},
    )
    reviews = rest.select(
        "concert_reviews",
        params={"select": "*", "deleted_at": "is.null"},
    )
    members_by_id = {str(row["user_id"]): row for row in members}
    attendees_by_concert: dict[str, list[dict[str, Any]]] = {}
    for attendee in attendees:
        attendees_by_concert.setdefault(str(attendee["concert_id"]), []).append(attendee)
    reviews_by_concert: dict[str, list[dict[str, Any]]] = {}
    for review in reviews:
        reviews_by_concert.setdefault(str(review["concert_id"]), []).append(review)

    response_concerts: list[ConcertResponse] = []
    analytics_rows: list[AnalyticsConcert] = []
    personal_analytics_rows: list[AnalyticsConcert] = []
    for concert in concerts:
        concert_id = str(concert["id"])
        review_responses = []
        member_ratings: dict[str, Decimal | None] = {}
        for review in reviews_by_concert.get(concert_id, []):
            result = _review_result(review)
            reviewer_id = str(review["reviewer_user_id"])
            member_ratings[reviewer_id] = result.final_rating
            review_responses.append(
                ReviewResponse(
                    id=str(review["id"]),
                    reviewer_user_id=reviewer_id,
                    reviewer_name=str(
                        members_by_id.get(reviewer_id, {}).get("display_name", "Member")
                    ),
                    enjoyment_score=_float(review.get("enjoyment_score")),
                    stage_score=_float(review.get("stage_score")),
                    setlist_score=_float(review.get("setlist_score")),
                    seat_score=_float(review.get("seat_score")),
                    override_rating=_float(result.override_rating),
                    override_reason=result.override_reason,
                    notes=review.get("review_notes"),
                    calculated_rating=_float(result.calculated_rating),
                    final_rating=_float(result.final_rating),
                    is_overridden=result.is_overridden,
                    row_version=int(review["row_version"]),
                )
            )
        combined = combine_final_ratings(list(member_ratings.values()))
        attendee_responses = [
            AttendeeResponse(
                user_id=str(row["user_id"]),
                display_name=str(
                    members_by_id.get(str(row["user_id"]), {}).get("display_name", "Member")
                ),
                attendance_status=row["attendance_status"],
                row_version=int(row["row_version"]),
            )
            for row in attendees_by_concert.get(concert_id, [])
        ]
        response_concerts.append(
            ConcertResponse(
                id=concert_id,
                artist=concert["artist"],
                tour=concert.get("tour_name"),
                date=concert["concert_date"],
                venue=concert["venue"],
                price=_float(concert.get("price")),
                genre=concert.get("genre"),
                projected=_float(concert.get("projected_rating")),
                seat=concert.get("seat"),
                status=concert["status"],
                type=concert["concert_type"],
                setlist_url=concert.get("setlist_url"),
                spotify_url=concert.get("spotify_url"),
                image=concert.get("image_url"),
                notes=concert.get("notes"),
                companions=concert.get("companions"),
                row_version=int(concert["row_version"]),
                attendees=attendee_responses,
                reviews=review_responses,
                personal_rating=_float(member_ratings.get(current_user_id)),
                combined_rating=_float(combined),
            )
        )
        analytics_row = AnalyticsConcert(
            concert_id=concert_id,
            artist=concert["artist"],
            concert_date=date.fromisoformat(str(concert["concert_date"])),
            venue=concert["venue"],
            status=concert["status"],
            price=Decimal(str(concert["price"])) if concert.get("price") is not None else None,
            genre=concert.get("genre"),
            projected_rating=Decimal(str(concert["projected_rating"]))
            if concert.get("projected_rating") is not None
            else None,
            member_ratings=member_ratings,
            combined_rating=combined,
            ranking_tiebreaker=concert.get("legacy_rank"),
        )
        analytics_rows.append(analytics_row)
        current_attendee = next(
            (row for row in attendee_responses if row.user_id == current_user_id),
            None,
        )
        if current_attendee and (
            concert["status"] == "Cancelled"
            or current_attendee.attendance_status != "Did Not Attend"
        ):
            personal_analytics_rows.append(analytics_row)

    analytics: AnalyticsResponse = analytics_response(calculate_analytics(analytics_rows))
    personal_analytics: AnalyticsResponse = analytics_response(
        calculate_analytics(personal_analytics_rows)
    )
    return LibraryResponse(
        members=[MemberSummary.model_validate(row) for row in members],
        concerts=response_concerts,
        analytics=analytics,
        personal_analytics=personal_analytics,
    )


def _find_concert(rest: SupabaseRestClient, concert_id: UUID) -> dict[str, Any] | None:
    rows = rest.select(
        "concerts",
        params={
            "select": "*",
            "id": f"eq.{concert_id}",
            "deleted_at": "is.null",
            "limit": 1,
        },
    )
    return rows[0] if rows else None


def _row_version_conflict(current: Mapping[str, Any] | None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "row_version_conflict",
            "message": (
                "This concert changed in the cloud. Review the latest version before saving."
            ),
            "current": dict(current) if current else None,
        },
    )


def _write_review(
    rest: SupabaseRestClient,
    concert_id: UUID,
    payload: ReviewWrite,
    user_id: str,
    mutation_id: UUID,
) -> int:
    try:
        result = calculate_rating(
            ReviewScores(
                payload.enjoyment_score,
                payload.stage_score,
                payload.setlist_score,
                payload.seat_score,
            ),
            override_rating=payload.override_rating,
            override_reason=payload.override_reason,
        )
    except RatingValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    existing = rest.select(
        "concert_reviews",
        params={
            "select": "*",
            "concert_id": f"eq.{concert_id}",
            "reviewer_user_id": f"eq.{user_id}",
            "deleted_at": "is.null",
            "limit": 1,
        },
    )
    row = {
        "enjoyment_score": payload.enjoyment_score,
        "stage_score": payload.stage_score,
        "setlist_score": payload.setlist_score,
        "seat_score": payload.seat_score,
        "rating_override": _float(result.override_rating),
        "rating_override_reason": result.override_reason,
        "review_notes": payload.notes if payload.notes and payload.notes.strip() else None,
        "rating_rule_version_id": _current_rule_id(rest),
        "last_mutation_id": str(mutation_id),
    }
    if existing:
        current = existing[0]
        if str(current.get("last_mutation_id")) == str(mutation_id):
            return int(current["row_version"])
        if payload.expected_row_version != int(current["row_version"]):
            raise _row_version_conflict(current)
        updated = rest.update(
            "concert_reviews",
            row,
            params={
                "id": f"eq.{current['id']}",
                "row_version": f"eq.{payload.expected_row_version}",
            },
        )
        if not updated:
            raise _row_version_conflict(existing[0])
        return int(updated[0]["row_version"])
    inserted = rest.insert(
        "concert_reviews",
        {
            "id": str(payload.id),
            "concert_id": str(concert_id),
            "reviewer_user_id": user_id,
            "created_by": user_id,
            **row,
        },
    )
    return int(inserted[0]["row_version"])


@router.get("/library", response_model=LibraryResponse)
def get_library(
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> LibraryResponse:
    try:
        return build_library(rest, str(user.user_id))
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.get("/concerts/export.csv")
def export_concerts_csv(
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> Response:
    try:
        library = build_library(rest, str(user.user_id))
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Artist",
            "Tour",
            "Date",
            "Venue",
            "Price",
            "Genre",
            "Status",
            "Your rating",
            "Combined rating",
            "Attendees",
        ]
    )
    for concert in library.concerts:
        writer.writerow(
            [
                concert.artist,
                concert.tour or "",
                concert.date.isoformat(),
                concert.venue,
                concert.price if concert.price is not None else "",
                concert.genre or "",
                concert.status,
                concert.personal_rating if concert.personal_rating is not None else "",
                concert.combined_rating if concert.combined_rating is not None else "",
                ", ".join(
                    row.display_name
                    for row in concert.attendees
                    if row.attendance_status != "Did Not Attend"
                ),
            ]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="concert-tracker.csv"'},
    )


@router.post("/concerts", response_model=MutationResponse)
def create_concert(
    payload: ConcertCreate,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> MutationResponse:
    user_id = str(user.user_id)
    path = "/v1/concerts"
    request_hash = _request_hash("POST", path, payload.model_dump(mode="json"))
    try:
        replay = _read_replay(rest, user_id, idempotency_key, request_hash)
        if replay:
            return replay
        existing = _find_concert(rest, payload.id)
        if existing and str(existing.get("last_mutation_id")) != str(idempotency_key):
            raise HTTPException(status_code=409, detail="Concert ID already exists")
        members = _member_rows(rest)
        attendee_ids = _validate_attendee_ids(
            members,
            {str(value) for value in payload.attendee_user_ids},
            user_id,
        )
        if existing:
            rows = [existing]
        else:
            rows = rest.insert(
                "concerts",
                {
                    "id": str(payload.id),
                    **_concert_payload(payload),
                    "created_by": user_id,
                    "last_mutation_id": str(idempotency_key),
                },
            )
        attendee_status = _attendance_status(payload.status)
        current_attendees = rest.select(
            "concert_attendees",
            params={
                "select": "user_id",
                "concert_id": f"eq.{payload.id}",
                "deleted_at": "is.null",
            },
        )
        current_attendee_ids = {str(row["user_id"]) for row in current_attendees}
        missing_attendees = attendee_ids - current_attendee_ids
        if missing_attendees:
            rest.insert(
                "concert_attendees",
                [
                    {
                        "concert_id": str(payload.id),
                        "user_id": attendee_id,
                        "attendance_status": attendee_status,
                        "created_by": user_id,
                        "last_mutation_id": str(idempotency_key),
                    }
                    for attendee_id in sorted(missing_attendees)
                ],
            )
        if payload.review:
            _write_review(rest, payload.id, payload.review, user_id, idempotency_key)
        result = MutationResponse(
            concert_id=str(payload.id),
            resource_row_version=int(rows[0]["row_version"]),
            replayed=existing is not None,
            message="Concert already saved" if existing else "Concert saved",
        )
        _store_replay(rest, user_id, idempotency_key, "POST", path, request_hash, result)
        return result
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.patch("/concerts/{concert_id}", response_model=MutationResponse)
def update_concert(
    concert_id: UUID,
    payload: ConcertUpdate,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> MutationResponse:
    user_id = str(user.user_id)
    path = f"/v1/concerts/{concert_id}"
    request_hash = _request_hash("PATCH", path, payload.model_dump(mode="json"))
    try:
        replay = _read_replay(rest, user_id, idempotency_key, request_hash)
        if replay:
            return replay
        current = _find_concert(rest, concert_id)
        if not current:
            raise HTTPException(status_code=404, detail="Concert not found")
        if str(current.get("last_mutation_id")) == str(idempotency_key):
            return MutationResponse(
                concert_id=str(concert_id),
                resource_row_version=int(current["row_version"]),
                replayed=True,
                message="Concert already updated",
            )
        if int(current["row_version"]) != payload.expected_row_version:
            raise _row_version_conflict(current)
        updated = rest.update(
            "concerts",
            {
                **_concert_payload(payload),
                "last_mutation_id": str(idempotency_key),
            },
            params={
                "id": f"eq.{concert_id}",
                "row_version": f"eq.{payload.expected_row_version}",
                "deleted_at": "is.null",
            },
        )
        if not updated:
            raise _row_version_conflict(_find_concert(rest, concert_id))
        result = MutationResponse(
            concert_id=str(concert_id),
            resource_row_version=int(updated[0]["row_version"]),
            message="Concert updated",
        )
        _store_replay(rest, user_id, idempotency_key, "PATCH", path, request_hash, result)
        return result
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.delete("/concerts/{concert_id}", response_model=MutationResponse)
def delete_concert(
    concert_id: UUID,
    expected_row_version: int,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> MutationResponse:
    user_id = str(user.user_id)
    path = f"/v1/concerts/{concert_id}"
    request_hash = _request_hash("DELETE", path, {"expected_row_version": expected_row_version})
    try:
        replay = _read_replay(rest, user_id, idempotency_key, request_hash)
        if replay:
            return replay
        current = _find_concert(rest, concert_id)
        if not current:
            raise HTTPException(status_code=404, detail="Concert not found")
        if int(current["row_version"]) != expected_row_version:
            raise _row_version_conflict(current)
        changed = rest.update_count(
            "concerts",
            {
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "last_mutation_id": str(idempotency_key),
            },
            params={
                "id": f"eq.{concert_id}",
                "row_version": f"eq.{expected_row_version}",
                "deleted_at": "is.null",
            },
        )
        if changed != 1:
            raise _row_version_conflict(_find_concert(rest, concert_id))
        result = MutationResponse(
            concert_id=str(concert_id),
            resource_row_version=expected_row_version + 1,
            message="Concert deleted",
        )
        _store_replay(rest, user_id, idempotency_key, "DELETE", path, request_hash, result)
        return result
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.put("/concerts/{concert_id}/attendees", response_model=MutationResponse)
def update_attendees(
    concert_id: UUID,
    payload: AttendanceWrite,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> MutationResponse:
    user_id = str(user.user_id)
    path = f"/v1/concerts/{concert_id}/attendees"
    request_hash = _request_hash("PUT", path, payload.model_dump(mode="json"))
    try:
        replay = _read_replay(rest, user_id, idempotency_key, request_hash)
        if replay:
            return replay
        concert = _find_concert(rest, concert_id)
        if not concert:
            raise HTTPException(status_code=404, detail="Concert not found")
        desired = _validate_attendee_ids(
            _member_rows(rest),
            {str(value) for value in payload.attendee_user_ids},
            user_id,
        )
        existing = rest.select(
            "concert_attendees",
            params={
                "select": "*",
                "concert_id": f"eq.{concert_id}",
                "deleted_at": "is.null",
            },
        )
        existing_by_user = {str(row["user_id"]): row for row in existing}
        active_status = _attendance_status(str(concert["status"]))
        versions = []
        for attendee_user_id, current in existing_by_user.items():
            target_status = active_status if attendee_user_id in desired else "Did Not Attend"
            if current["attendance_status"] == target_status:
                versions.append(int(current["row_version"]))
                continue
            expected = payload.expected_versions.get(attendee_user_id)
            if expected != int(current["row_version"]):
                raise _row_version_conflict(current)
            updated = rest.update(
                "concert_attendees",
                {
                    "attendance_status": target_status,
                    "last_mutation_id": str(idempotency_key),
                },
                params={
                    "concert_id": f"eq.{concert_id}",
                    "user_id": f"eq.{attendee_user_id}",
                    "row_version": f"eq.{expected}",
                },
            )
            if not updated:
                raise _row_version_conflict(current)
            versions.append(int(updated[0]["row_version"]))
        for attendee_user_id in sorted(desired - set(existing_by_user)):
            inserted = rest.insert(
                "concert_attendees",
                {
                    "concert_id": str(concert_id),
                    "user_id": attendee_user_id,
                    "attendance_status": active_status,
                    "created_by": user_id,
                    "last_mutation_id": str(idempotency_key),
                },
            )
            versions.append(int(inserted[0]["row_version"]))
        result = MutationResponse(
            concert_id=str(concert_id),
            resource_row_version=max(versions, default=1),
            message="Attendance updated",
        )
        _store_replay(rest, user_id, idempotency_key, "PUT", path, request_hash, result)
        return result
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.put("/concerts/{concert_id}/review", response_model=MutationResponse)
def update_review(
    concert_id: UUID,
    payload: ReviewWrite,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> MutationResponse:
    user_id = str(user.user_id)
    path = f"/v1/concerts/{concert_id}/review"
    request_hash = _request_hash("PUT", path, payload.model_dump(mode="json"))
    try:
        replay = _read_replay(rest, user_id, idempotency_key, request_hash)
        if replay:
            return replay
        if not _find_concert(rest, concert_id):
            raise HTTPException(status_code=404, detail="Concert not found")
        row_version = _write_review(rest, concert_id, payload, user_id, idempotency_key)
        result = MutationResponse(
            concert_id=str(concert_id),
            resource_row_version=row_version,
            message="Review saved",
        )
        _store_replay(rest, user_id, idempotency_key, "PUT", path, request_hash, result)
        return result
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc
