"""Spotify OAuth and artist-pulse routes.

The connection flow is deliberately split so that the deployed backend never
needs the Supabase service-role key:

1. ``GET /v1/spotify/login`` (authenticated) mints a short-lived, HMAC-signed
   ``state`` that encodes the member id and returns the Spotify consent URL.
2. ``GET /v1/spotify/callback`` (unauthenticated browser redirect) verifies the
   signed state, exchanges the authorization code for tokens, and bounces back
   into the SPA with the refresh token in the URL fragment (fragments are never
   sent to the server, so they stay out of access logs).
3. ``POST /v1/spotify/connect`` (authenticated) persists the refresh token into
   ``spotify_accounts`` using the member's own Supabase JWT, so row-level
   security still applies.

Later, ``GET /v1/spotify/pulse`` reads the stored refresh token with the
member's JWT, refreshes an access token, and assembles recent releases from the
artists the member follows and listens to most.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from backend.members import AppMember, require_member
from backend.settings import Settings, SettingsError, get_settings
from backend.supabase_rest import SupabaseRestClient, SupabaseRestError, get_rest_client

router = APIRouter(prefix="/v1/spotify", tags=["spotify"])

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_SCOPES = "user-follow-read user-top-read user-read-recently-played"

STATE_TTL_SECONDS = 600
RELEASE_WINDOW_DAYS = 90
MAX_ARTISTS_SCANNED = 50
MAX_RELEASES_RETURNED = 15

VALID_TIME_RANGES = {"short_term", "medium_term", "long_term"}
_YEAR_SUFFIX = re.compile(r"\b(19|20)\d{2}\b")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


class LoginResponse(BaseModel):
    authorize_url: str


class StatusResponse(BaseModel):
    connected: bool


class ConnectRequest(BaseModel):
    refresh_token: str


class ReleaseItem(BaseModel):
    artist: str
    title: str
    release_type: str
    release_date: str
    url: Optional[str] = None
    image: Optional[str] = None


class PulseResponse(BaseModel):
    connected: bool
    releases: list[ReleaseItem]
    checked_artists: int


def _require_spotify(settings: Settings) -> None:
    if not settings.spotify_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Spotify integration is not configured for this deployment",
        )


def _settings_or_503() -> Settings:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    _require_spotify(settings)
    return settings


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign_state(user_id: str, secret: str) -> str:
    payload = f"{user_id}:{int(time.time())}:{secrets.token_hex(8)}"
    signature = hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).digest()
    return f"{_b64url(payload.encode('utf-8'))}.{_b64url(signature)}"


def _verify_state(state: str, secret: str) -> str:
    try:
        payload_b64, signature_b64 = state.split(".", 1)
        payload = _b64url_decode(payload_b64)
        signature = _b64url_decode(signature_b64)
    except Exception:  # noqa: BLE001 - any decode failure means an invalid state
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state")
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state")
    try:
        user_id, issued_at_raw, _nonce = payload.decode("utf-8").split(":", 2)
        issued_at = int(issued_at_raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state")
    if time.time() - issued_at > STATE_TTL_SECONDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="State expired")
    return user_id


def _app_origin(settings: Settings) -> str:
    # Redirect URI looks like https://host/api/v1/spotify/callback; strip the API path.
    marker = "/api/"
    uri = settings.spotify_redirect_uri
    index = uri.find(marker)
    return uri[:index] if index != -1 else uri


def _stats_url(settings: Settings, fragment: str) -> str:
    # The SPA renders the stats view from a query param, not a /stats path.
    return f"{_app_origin(settings)}/?view=stats&scope=personal#{fragment}"


def _basic_auth_header(settings: Settings) -> str:
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


@router.get("/status", response_model=StatusResponse)
def spotify_status(
    _member: AppMember = Depends(require_member),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> StatusResponse:
    _settings_or_503()
    try:
        rows = rest.select("spotify_accounts", params={"select": "user_id", "limit": "1"})
    except SupabaseRestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return StatusResponse(connected=len(rows) > 0)


@router.get("/login", response_model=LoginResponse)
def spotify_login(member: AppMember = Depends(require_member)) -> LoginResponse:
    settings = _settings_or_503()
    state = _sign_state(str(member.user_id), settings.spotify_client_secret)
    query = urlencode(
        {
            "client_id": settings.spotify_client_id,
            "response_type": "code",
            "redirect_uri": settings.spotify_redirect_uri,
            "scope": SPOTIFY_SCOPES,
            "state": state,
            "show_dialog": "false",
        }
    )
    return LoginResponse(authorize_url=f"{SPOTIFY_AUTH_URL}?{query}")


@router.get("/callback")
def spotify_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
) -> RedirectResponse:
    settings = _settings_or_503()
    if error or not code or not state:
        reason = error or "missing_code"
        return RedirectResponse(url=_stats_url(settings, f"spotify_error={reason}"), status_code=302)

    _verify_state(state, settings.spotify_client_secret)

    try:
        response = httpx.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.spotify_redirect_uri,
            },
            headers={"Authorization": _basic_auth_header(settings)},
            timeout=10,
        )
        response.raise_for_status()
        tokens = response.json()
    except (httpx.HTTPError, ValueError):
        return RedirectResponse(url=_stats_url(settings, "spotify_error=exchange_failed"), status_code=302)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return RedirectResponse(url=_stats_url(settings, "spotify_error=no_refresh_token"), status_code=302)

    fragment = urlencode({"spotify_refresh": refresh_token, "spotify_scope": tokens.get("scope", "")})
    return RedirectResponse(url=_stats_url(settings, fragment), status_code=302)


@router.post("/connect", response_model=StatusResponse)
def spotify_connect(
    body: ConnectRequest,
    member: AppMember = Depends(require_member),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> StatusResponse:
    _settings_or_503()
    refresh_token = body.refresh_token.strip()
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing refresh token")
    payload = {
        "user_id": str(member.user_id),
        "refresh_token": refresh_token,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        rest.request(
            "POST",
            "spotify_accounts",
            params={"on_conflict": "user_id"},
            json=payload,
            prefer="resolution=merge-duplicates,return=minimal",
        )
    except SupabaseRestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return StatusResponse(connected=True)


@router.post("/disconnect", response_model=StatusResponse)
def spotify_disconnect(
    member: AppMember = Depends(require_member),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> StatusResponse:
    _settings_or_503()
    try:
        rest.request(
            "DELETE",
            "spotify_accounts",
            params={"user_id": f"eq.{member.user_id}"},
            prefer="return=minimal",
        )
    except SupabaseRestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return StatusResponse(connected=False)


def _refresh_access_token(refresh_token: str, settings: Settings) -> str:
    try:
        response = httpx.post(
            SPOTIFY_TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            headers={"Authorization": _basic_auth_header(settings)},
            timeout=10,
        )
        response.raise_for_status()
        access_token = response.json().get("access_token")
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Spotify token refresh failed",
        ) from exc
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Spotify token refresh failed"
        )
    return access_token


def _spotify_get(client: httpx.Client, access_token: str, path: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.get(
        f"{SPOTIFY_API_BASE}{path}",
        params=params,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def _collect_artists(client: httpx.Client, access_token: str) -> list[dict[str, Any]]:
    artists: dict[str, dict[str, Any]] = {}
    try:
        top = _spotify_get(client, access_token, "/me/top/artists", {"limit": 50, "time_range": "medium_term"})
        for item in top.get("items", []):
            if item.get("id"):
                artists[item["id"]] = item
        following = _spotify_get(client, access_token, "/me/following", {"type": "artist", "limit": 50})
        for item in following.get("artists", {}).get("items", []):
            if item.get("id") and item["id"] not in artists:
                artists[item["id"]] = item
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Spotify artist lookup failed"
        ) from exc
    return list(artists.values())[:MAX_ARTISTS_SCANNED]


def _parse_release_date(raw: str) -> Optional[date]:
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _latest_release(client: httpx.Client, access_token: str, artist: dict[str, Any]) -> Optional[ReleaseItem]:
    try:
        albums = _spotify_get(
            client,
            access_token,
            f"/artists/{artist['id']}/albums",
            {"include_groups": "single,album", "market": "CA", "limit": 5},
        )
    except httpx.HTTPError:
        return None
    newest: Optional[tuple[date, dict[str, Any]]] = None
    for album in albums.get("items", []):
        parsed = _parse_release_date(str(album.get("release_date", "")))
        if parsed is None:
            continue
        if newest is None or parsed > newest[0]:
            newest = (parsed, album)
    if newest is None:
        return None
    release_date, album = newest
    if release_date < date.today() - timedelta(days=RELEASE_WINDOW_DAYS):
        return None
    images = album.get("images") or []
    return ReleaseItem(
        artist=artist.get("name", "Unknown artist"),
        title=str(album.get("name", "New release")),
        release_type=str(album.get("album_type", "release")),
        release_date=release_date.isoformat(),
        url=(album.get("external_urls") or {}).get("spotify"),
        image=images[0]["url"] if images else None,
    )


@router.get("/pulse", response_model=PulseResponse)
def spotify_pulse(
    member: AppMember = Depends(require_member),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> PulseResponse:
    settings = _settings_or_503()
    try:
        rows = rest.select(
            "spotify_accounts", params={"select": "refresh_token", "limit": "1"}
        )
    except SupabaseRestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if not rows:
        return PulseResponse(connected=False, releases=[], checked_artists=0)

    access_token = _refresh_access_token(rows[0]["refresh_token"], settings)
    with httpx.Client() as client:
        artists = _collect_artists(client, access_token)
        # httpx.Client is safe to share across threads; fan out the per-artist album
        # lookups so scanning 50 artists stays fast enough for a serverless request.
        with ThreadPoolExecutor(max_workers=8) as pool:
            found = pool.map(lambda artist: _latest_release(client, access_token, artist), artists)
        releases = [release for release in found if release is not None]
    releases.sort(key=lambda item: item.release_date, reverse=True)
    return PulseResponse(
        connected=True,
        releases=releases[:MAX_RELEASES_RETURNED],
        checked_artists=len(artists),
    )


class TopArtist(BaseModel):
    name: str
    rank: int
    url: Optional[str] = None
    image: Optional[str] = None
    seen_live: bool = False


class TopTrack(BaseModel):
    name: str
    artist: str
    rank: int
    url: Optional[str] = None
    image: Optional[str] = None


class RecentTrack(BaseModel):
    name: str
    artist: str
    played_at: str
    url: Optional[str] = None


class OverlapSummary(BaseModel):
    seen_count: int
    top_count: int
    seen_names: list[str]


class NextShowInsight(BaseModel):
    artist: str
    date: str
    listens_rank: Optional[int] = None
    recently_played: bool = False


class InsightsResponse(BaseModel):
    connected: bool
    range: str
    top_artists: list[TopArtist]
    top_tracks: list[TopTrack]
    recently_played: list[RecentTrack]
    overlap: OverlapSummary
    next_show: Optional[NextShowInsight] = None


def _normalize_artist(name: str) -> str:
    lowered = _YEAR_SUFFIX.sub(" ", name.lower())
    return _NON_ALNUM.sub(" ", lowered).strip()


def _artist_matches(spotify_name: str, concert_names: set[str]) -> bool:
    normalized = _normalize_artist(spotify_name)
    if not normalized:
        return False
    for concert in concert_names:
        if concert and (normalized == concert or normalized in concert or concert in normalized):
            return True
    return False


@router.get("/insights", response_model=InsightsResponse)
def spotify_insights(
    time_range: str = Query(default="medium_term", alias="range"),
    member: AppMember = Depends(require_member),
    rest: SupabaseRestClient = Depends(get_rest_client),
) -> InsightsResponse:
    settings = _settings_or_503()
    if time_range not in VALID_TIME_RANGES:
        time_range = "medium_term"
    try:
        rows = rest.select("spotify_accounts", params={"select": "refresh_token", "limit": "1"})
    except SupabaseRestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    empty_overlap = OverlapSummary(seen_count=0, top_count=0, seen_names=[])
    if not rows:
        return InsightsResponse(
            connected=False, range=time_range, top_artists=[], top_tracks=[],
            recently_played=[], overlap=empty_overlap,
        )

    try:
        concerts = rest.select(
            "concerts", params={"select": "artist,concert_date,status", "deleted_at": "is.null"}
        )
    except SupabaseRestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    attended_names = {
        _normalize_artist(str(row.get("artist", "")))
        for row in concerts
        if row.get("status") == "Attended"
    }

    access_token = _refresh_access_token(rows[0]["refresh_token"], settings)
    with httpx.Client() as client:
        try:
            top_artists_raw = _spotify_get(client, access_token, "/me/top/artists", {"limit": 20, "time_range": time_range})
            top_tracks_raw = _spotify_get(client, access_token, "/me/top/tracks", {"limit": 10, "time_range": time_range})
            recent_raw = _spotify_get(client, access_token, "/me/player/recently-played", {"limit": 20})
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Spotify insights lookup failed") from exc

    top_artists: list[TopArtist] = []
    seen_names: list[str] = []
    for index, item in enumerate(top_artists_raw.get("items", []), start=1):
        name = str(item.get("name", "Unknown artist"))
        images = item.get("images") or []
        seen = _artist_matches(name, attended_names)
        if seen:
            seen_names.append(name)
        top_artists.append(TopArtist(
            name=name,
            rank=index,
            url=(item.get("external_urls") or {}).get("spotify"),
            image=images[-1]["url"] if images else None,
            seen_live=seen,
        ))

    top_tracks: list[TopTrack] = []
    for index, item in enumerate(top_tracks_raw.get("items", []), start=1):
        artists = item.get("artists") or []
        album_images = (item.get("album") or {}).get("images") or []
        top_tracks.append(TopTrack(
            name=str(item.get("name", "Unknown track")),
            artist=", ".join(a.get("name", "") for a in artists) or "Unknown artist",
            rank=index,
            url=(item.get("external_urls") or {}).get("spotify"),
            image=album_images[-1]["url"] if album_images else None,
        ))

    recent: list[RecentTrack] = []
    recent_artist_norm: set[str] = set()
    seen_track_keys: set[str] = set()
    for item in recent_raw.get("items", []):
        track = item.get("track") or {}
        artists = track.get("artists") or []
        artist_name = ", ".join(a.get("name", "") for a in artists) or "Unknown artist"
        key = f"{track.get('name')}|{artist_name}"
        if key in seen_track_keys:
            continue
        seen_track_keys.add(key)
        recent_artist_norm.update(_normalize_artist(a.get("name", "")) for a in artists)
        recent.append(RecentTrack(
            name=str(track.get("name", "Unknown track")),
            artist=artist_name,
            played_at=str(item.get("played_at", "")),
            url=(track.get("external_urls") or {}).get("spotify"),
        ))
        if len(recent) >= 8:
            break

    today = date.today()
    upcoming = sorted(
        (
            row for row in concerts
            if row.get("status") == "Want to Go"
            and (parsed := _parse_release_date(str(row.get("concert_date", "")))) is not None
            and parsed >= today
        ),
        key=lambda row: str(row.get("concert_date", "")),
    )
    next_show: Optional[NextShowInsight] = None
    if upcoming:
        nxt = upcoming[0]
        nxt_norm = _normalize_artist(str(nxt.get("artist", "")))
        rank = next(
            (a.rank for a in top_artists if nxt_norm and (_normalize_artist(a.name) == nxt_norm or nxt_norm in _normalize_artist(a.name) or _normalize_artist(a.name) in nxt_norm)),
            None,
        )
        recently = any(nxt_norm and rn and (nxt_norm in rn or rn in nxt_norm) for rn in recent_artist_norm)
        next_show = NextShowInsight(
            artist=str(nxt.get("artist", "")),
            date=str(nxt.get("concert_date", "")),
            listens_rank=rank,
            recently_played=recently,
        )

    return InsightsResponse(
        connected=True,
        range=time_range,
        top_artists=top_artists,
        top_tracks=top_tracks,
        recently_played=recent,
        overlap=OverlapSummary(seen_count=len(seen_names), top_count=len(top_artists), seen_names=seen_names),
        next_show=next_show,
    )
