from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from backend.settings import Settings, SettingsError, get_settings

bearer_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    user_id: UUID
    email: str
    role: str
    access_token: str


@lru_cache
def get_jwk_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=300)


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        signing_key = get_jwk_client(settings.jwks_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=settings.issuer,
            options={"require": ["exp", "iat", "sub", "email", "role"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    email = str(claims.get("email", "")).strip().lower()
    if email not in settings.allowed_emails or claims.get("role") != "authenticated":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not authorized")
    return claims


def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    claims = decode_access_token(credentials.credentials, settings)
    return AuthenticatedUser(
        user_id=UUID(str(claims["sub"])),
        email=str(claims["email"]).lower(),
        role=str(claims["role"]),
        access_token=credentials.credentials,
    )
