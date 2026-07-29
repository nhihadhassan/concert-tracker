from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel

from backend.settings import SettingsError, get_settings


class PublicUser(BaseModel):
    """The single identity every request runs as, now that sign-in is gone."""

    user_id: UUID
    email: str
    display_name: str


def current_user() -> PublicUser:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return PublicUser(
        user_id=settings.public_user_id,
        email=settings.public_user_email,
        display_name=settings.public_user_display_name,
    )
