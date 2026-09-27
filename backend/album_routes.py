from __future__ import annotations

import base64
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from backend.album_models import (
    AlbumImportWrite,
    AlbumLibraryResponse,
    AlbumMutationResponse,
    AlbumResponse,
    AlbumReviewResponse,
    AlbumReviewWrite,
    AlbumTrackResponse,
    AlbumTrackReviewResponse,
    SpotifyAlbumOption,
    SpotifyAlbumSearchResponse,
)
from backend.identity import PublicUser, current_user
from backend.settings import Settings, SettingsError, get_settings
from backend.supabase_rest import SupabaseRestClient, SupabaseRestError, get_rest_client

router = APIRouter(prefix="/v1/albums", tags=["albums"])
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"


def _translate_rest(exc: SupabaseRestError) -> HTTPException:
    if exc.status_code in {401, 403, 409, 503}:
        return HTTPException(status_code=exc.status_code, detail=exc.message)
    return HTTPException(status_code=502, detail="Cloud album request failed")


def _settings() -> Settings:
    try:
        value = get_settings()
    except SettingsError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not value.spotify_client_id or not value.spotify_client_secret:
        raise HTTPException(status_code=503, detail="Spotify album lookup is not configured")
    return value


def _spotify_token(client: httpx.Client, settings: Settings) -> str:
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()
    response = client.post(
        SPOTIFY_TOKEN_URL,
        headers={"Authorization": "Basic " + base64.b64encode(raw).decode("ascii")},
        data={"grant_type": "client_credentials"},
        timeout=10,
    )
    try:
        response.raise_for_status()
        token = str(response.json()["access_token"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Spotify authorization failed") from exc
    return token


def _spotify_get(
    client: httpx.Client,
    token: str,
    path: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = client.get(
        f"{SPOTIFY_API_BASE}{path}",
        params=params,
        headers={"Authorization": f"Bearer {token}"},
        timeout=12,
    )
    try:
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Spotify album lookup failed") from exc


def _artist_name(value: Mapping[str, Any]) -> str:
    return ", ".join(str(row.get("name", "")).strip() for row in value.get("artists", []))


def _image_url(value: Mapping[str, Any]) -> str | None:
    images = value.get("images", [])
    return str(images[0]["url"]) if images else None


def _album_option(value: Mapping[str, Any]) -> SpotifyAlbumOption:
    external_urls = value.get("external_urls", {})
    return SpotifyAlbumOption(
        spotify_album_id=str(value["id"]),
        title=str(value["name"]),
        artist=_artist_name(value),
        release_date=value.get("release_date"),
        album_type=str(value.get("album_type", "album")),
        total_tracks=int(value.get("total_tracks", 0)),
        image_url=_image_url(value),
        spotify_url=external_urls.get("spotify"),
    )


def build_album_library(rest: SupabaseRestClient) -> AlbumLibraryResponse:
    members = rest.select(
        "app_members",
        params={
            "select": "user_id,display_name",
            "is_active": "eq.true",
            "deleted_at": "is.null",
        },
    )
    albums = rest.select(
        "albums",
        params={"select": "*", "deleted_at": "is.null", "order": "created_at.desc"},
    )
    tracks = rest.select(
        "album_tracks",
        params={
            "select": "*",
            "deleted_at": "is.null",
            "order": "disc_number.asc,track_number.asc",
        },
    )
    reviews = rest.select(
        "album_reviews",
        params={"select": "*", "deleted_at": "is.null", "order": "updated_at.desc"},
    )
    track_reviews = rest.select(
        "album_track_reviews",
        params={"select": "*", "deleted_at": "is.null"},
    )
    names = {str(row["user_id"]): str(row["display_name"]) for row in members}
    tracks_by_album: dict[str, list[dict[str, Any]]] = {}
    for track in tracks:
        tracks_by_album.setdefault(str(track["album_id"]), []).append(track)
    track_reviews_by_review: dict[str, list[dict[str, Any]]] = {}
    for row in track_reviews:
        track_reviews_by_review.setdefault(str(row["album_review_id"]), []).append(row)
    reviews_by_album: dict[str, list[dict[str, Any]]] = {}
    for review in reviews:
        reviews_by_album.setdefault(str(review["album_id"]), []).append(review)

    result = []
    for album in albums:
        album_id = str(album["id"])
        result.append(
            AlbumResponse(
                id=album_id,
                spotify_album_id=str(album["spotify_album_id"]),
                title=str(album["title"]),
                artist=str(album["artist"]),
                album_type=str(album["album_type"]),
                release_date=album.get("release_date"),
                release_date_precision=album.get("release_date_precision"),
                image_url=album.get("image_url"),
                spotify_url=album.get("spotify_url"),
                label=album.get("label"),
                genres=list(album.get("genres") or []),
                total_tracks=int(album.get("total_tracks", 0)),
                duration_ms=int(album.get("duration_ms", 0)),
                row_version=int(album["row_version"]),
                tracks=[
                    AlbumTrackResponse(
                        id=str(track["id"]),
                        spotify_track_id=str(track["spotify_track_id"]),
                        title=str(track["title"]),
                        disc_number=int(track["disc_number"]),
                        track_number=int(track["track_number"]),
                        duration_ms=int(track.get("duration_ms", 0)),
                        explicit=bool(track.get("explicit", False)),
                        spotify_url=track.get("spotify_url"),
                    )
                    for track in tracks_by_album.get(album_id, [])
                ],
                reviews=[
                    AlbumReviewResponse(
                        id=str(review["id"]),
                        reviewer_user_id=str(review["reviewer_user_id"]),
                        reviewer_name=names.get(str(review["reviewer_user_id"]), "Member"),
                        overall_score=float(review["overall_score"])
                        if review.get("overall_score") is not None
                        else None,
                        review_markdown=review.get("review_markdown"),
                        status=review["status"],
                        published_at=review.get("published_at"),
                        updated_at=str(review["updated_at"]),
                        row_version=int(review["row_version"]),
                        track_reviews=[
                            AlbumTrackReviewResponse(
                                id=str(row["id"]),
                                album_track_id=str(row["album_track_id"]),
                                personal_rank=int(row["personal_rank"])
                                if row.get("personal_rank") is not None
                                else None,
                                score=float(row["score"]) if row.get("score") is not None else None,
                                notes=row.get("notes"),
                                row_version=int(row["row_version"]),
                            )
                            for row in track_reviews_by_review.get(str(review["id"]), [])
                        ],
                    )
                    for review in reviews_by_album.get(album_id, [])
                ],
            )
        )
    return AlbumLibraryResponse(albums=result)


def _find_album(rest: SupabaseRestClient, album_id: UUID) -> dict[str, Any] | None:
    rows = rest.select(
        "albums",
        params={
            "select": "*",
            "id": f"eq.{album_id}",
            "deleted_at": "is.null",
            "limit": 1,
        },
    )
    return rows[0] if rows else None


def _conflict(current: Mapping[str, Any]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "row_version_conflict",
            "message": "This album review changed in the cloud. Reload it before saving.",
            "current": dict(current),
        },
    )


@router.get("", response_model=AlbumLibraryResponse)
def list_albums(
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> AlbumLibraryResponse:
    try:
        return build_album_library(rest)
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.get("/search", response_model=SpotifyAlbumSearchResponse)
def search_albums(
    q: str = Query(min_length=2, max_length=160),
) -> SpotifyAlbumSearchResponse:
    with httpx.Client() as client:
        token = _spotify_token(client, _settings())
        payload = _spotify_get(
            client,
            token,
            "/search",
            {"q": q.strip(), "type": "album", "limit": 10},
        )
    items = payload.get("albums", {}).get("items", [])
    return SpotifyAlbumSearchResponse(results=[_album_option(row) for row in items])


@router.post("/import", response_model=AlbumMutationResponse)
def import_album(
    payload: AlbumImportWrite,
    _idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> AlbumMutationResponse:
    user_id = str(user.user_id)
    try:
        existing = rest.select(
            "albums",
            params={
                "select": "*",
                "spotify_album_id": f"eq.{payload.spotify_album_id}",
                "deleted_at": "is.null",
                "limit": 1,
            },
        )
        if existing:
            return AlbumMutationResponse(
                album_id=str(existing[0]["id"]),
                resource_row_version=int(existing[0]["row_version"]),
                replayed=True,
                message="Album already in your journal",
            )
        with httpx.Client() as client:
            token = _spotify_token(client, _settings())
            album = _spotify_get(client, token, f"/albums/{payload.spotify_album_id}")
            track_page = album.get("tracks", {})
            tracks = list(track_page.get("items", []))
            offset = len(tracks)
            while track_page.get("next"):
                track_page = _spotify_get(
                    client,
                    token,
                    f"/albums/{payload.spotify_album_id}/tracks",
                    {"limit": 50, "offset": offset},
                )
                page_items = list(track_page.get("items", []))
                if not page_items:
                    break
                tracks.extend(page_items)
                offset += len(page_items)
        duration_ms = sum(int(row.get("duration_ms", 0)) for row in tracks)
        external_urls = album.get("external_urls", {})
        inserted = rest.insert(
            "albums",
            {
                "id": str(payload.id),
                "spotify_album_id": str(album["id"]),
                "title": str(album["name"]),
                "artist": _artist_name(album),
                "album_type": str(album.get("album_type", "album")),
                "release_date": album.get("release_date"),
                "release_date_precision": album.get("release_date_precision"),
                "image_url": _image_url(album),
                "spotify_url": external_urls.get("spotify"),
                "label": album.get("label"),
                "genres": list(album.get("genres") or []),
                "total_tracks": int(album.get("total_tracks", len(tracks))),
                "duration_ms": duration_ms,
                "created_by": user_id,
            },
        )
        if tracks:
            rest.insert(
                "album_tracks",
                [
                    {
                        "id": str(uuid4()),
                        "album_id": str(payload.id),
                        "spotify_track_id": str(track["id"]),
                        "title": str(track["name"]),
                        "disc_number": int(track.get("disc_number", 1)),
                        "track_number": int(track["track_number"]),
                        "duration_ms": int(track.get("duration_ms", 0)),
                        "explicit": bool(track.get("explicit", False)),
                        "spotify_url": track.get("external_urls", {}).get("spotify"),
                        "created_by": user_id,
                    }
                    for track in tracks
                ],
            )
        return AlbumMutationResponse(
            album_id=str(payload.id),
            resource_row_version=int(inserted[0]["row_version"]),
            message=f"{album['name']} added to Albums",
        )
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc


@router.put("/{album_id}/review", response_model=AlbumMutationResponse)
def save_album_review(
    album_id: UUID,
    payload: AlbumReviewWrite,
    idempotency_key: UUID = Header(alias="Idempotency-Key"),
    user: PublicUser = Depends(current_user),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> AlbumMutationResponse:
    user_id = str(user.user_id)
    try:
        if not _find_album(rest, album_id):
            raise HTTPException(status_code=404, detail="Album not found")
        album_tracks = rest.select(
            "album_tracks",
            params={
                "select": "id",
                "album_id": f"eq.{album_id}",
                "deleted_at": "is.null",
            },
        )
        allowed_track_ids = {str(row["id"]) for row in album_tracks}
        requested_track_ids = {str(row.album_track_id) for row in payload.track_reviews}
        if not requested_track_ids.issubset(allowed_track_ids):
            raise HTTPException(status_code=422, detail="Track reviews must belong to this album")
        if any(
            row.personal_rank is not None and row.personal_rank > len(album_tracks)
            for row in payload.track_reviews
        ):
            raise HTTPException(
                status_code=422,
                detail="Personal track ranks cannot exceed the album track count",
            )

        existing_rows = rest.select(
            "album_reviews",
            params={
                "select": "*",
                "album_id": f"eq.{album_id}",
                "reviewer_user_id": f"eq.{user_id}",
                "deleted_at": "is.null",
                "limit": 1,
            },
        )
        now = datetime.now(timezone.utc).isoformat()
        review_values = {
            "overall_score": payload.overall_score,
            "review_markdown": payload.review_markdown,
            "status": payload.status,
            "published_at": now if payload.status == "published" else None,
            "last_mutation_id": str(idempotency_key),
        }
        if existing_rows:
            current = existing_rows[0]
            if str(current.get("last_mutation_id")) == str(idempotency_key):
                return AlbumMutationResponse(
                    album_id=str(album_id),
                    review_id=str(current["id"]),
                    resource_row_version=int(current["row_version"]),
                    replayed=True,
                    message="Album review already saved",
                )
            if payload.expected_row_version != int(current["row_version"]):
                raise _conflict(current)
            updated = rest.update(
                "album_reviews",
                review_values,
                params={
                    "id": f"eq.{current['id']}",
                    "row_version": f"eq.{payload.expected_row_version}",
                },
            )
            if not updated:
                raise _conflict(current)
            review = updated[0]
        else:
            review = rest.insert(
                "album_reviews",
                {
                    "id": str(payload.id),
                    "album_id": str(album_id),
                    "reviewer_user_id": user_id,
                    "created_by": user_id,
                    **review_values,
                },
            )[0]

        review_id = str(review["id"])
        existing_track_reviews = rest.select(
            "album_track_reviews",
            params={
                "select": "*",
                "album_review_id": f"eq.{review_id}",
                "reviewer_user_id": f"eq.{user_id}",
                "deleted_at": "is.null",
            },
        )
        existing_by_track = {str(row["album_track_id"]): row for row in existing_track_reviews}
        for current in existing_track_reviews:
            if current.get("personal_rank") is not None:
                rest.update(
                    "album_track_reviews",
                    {"personal_rank": None},
                    params={"id": f"eq.{current['id']}"},
                )
        desired_track_ids = set()
        for value in payload.track_reviews:
            track_id = str(value.album_track_id)
            has_content = (
                value.personal_rank is not None
                or value.score is not None
                or bool(value.notes and value.notes.strip())
            )
            current = existing_by_track.get(track_id)
            if not has_content:
                if current:
                    rest.update(
                        "album_track_reviews",
                        {"deleted_at": now, "last_mutation_id": str(idempotency_key)},
                        params={"id": f"eq.{current['id']}"},
                    )
                continue
            desired_track_ids.add(track_id)
            values = {
                "personal_rank": value.personal_rank,
                "score": value.score,
                "notes": value.notes.strip() if value.notes and value.notes.strip() else None,
                "last_mutation_id": str(idempotency_key),
            }
            if current:
                rest.update(
                    "album_track_reviews",
                    values,
                    params={"id": f"eq.{current['id']}"},
                )
            else:
                rest.insert(
                    "album_track_reviews",
                    {
                        "id": str(value.id),
                        "album_review_id": review_id,
                        "album_track_id": track_id,
                        "reviewer_user_id": user_id,
                        "created_by": user_id,
                        **values,
                    },
                )
        for track_id, current in existing_by_track.items():
            if track_id not in desired_track_ids and track_id not in requested_track_ids:
                rest.update(
                    "album_track_reviews",
                    {"deleted_at": now, "last_mutation_id": str(idempotency_key)},
                    params={"id": f"eq.{current['id']}"},
                )

        return AlbumMutationResponse(
            album_id=str(album_id),
            review_id=review_id,
            resource_row_version=int(review["row_version"]),
            message="Album review published"
            if payload.status == "published"
            else "Album review saved as draft",
        )
    except SupabaseRestError as exc:
        raise _translate_rest(exc) from exc
