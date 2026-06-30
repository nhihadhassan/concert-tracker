from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from backend.auth import AuthenticatedUser, require_user
from backend.settings import SettingsError, get_settings


class AppMember(BaseModel):
    user_id: str
    email: str
    display_name: str
    is_active: bool


def fetch_member(user: AuthenticatedUser) -> AppMember:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        response = httpx.get(
            f"{settings.supabase_url}/rest/v1/app_members",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {user.access_token}",
            },
            params={
                "select": "user_id,email,display_name,is_active",
                "user_id": f"eq.{user.user_id}",
                "is_active": "eq.true",
                "deleted_at": "is.null",
            },
            timeout=8,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Membership service is unavailable",
        ) from exc

    if response.status_code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase rejected the access token",
        )
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Membership lookup failed",
        )

    rows: list[dict[str, Any]] = response.json()
    if len(rows) != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Active membership required"
        )
    return AppMember.model_validate(rows[0])


def require_member(user: AuthenticatedUser = Depends(require_user)) -> AppMember:
    return fetch_member(user)
