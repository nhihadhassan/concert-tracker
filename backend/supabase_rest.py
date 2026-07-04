from __future__ import annotations

from typing import Any

import httpx
from fastapi import Depends, HTTPException, status

from backend.auth import AuthenticatedUser, require_user
from backend.settings import SettingsError, get_settings


class SupabaseRestError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class SupabaseRestClient:
    def __init__(self, url: str, publishable_key: str, access_token: str) -> None:
        self.base_url = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": publishable_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        resource: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        timeout: float = 12,
    ) -> httpx.Response:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            response = httpx.request(
                method,
                f"{self.base_url}/{resource}",
                headers=headers,
                params=params,
                json=json,
                timeout=timeout,
            )
        except httpx.HTTPError as exc:
            raise SupabaseRestError(503, "Cloud data service is unavailable") from exc
        if response.status_code >= 400:
            try:
                body = response.json()
                message = body.get("message") or body.get("hint") or body.get("details")
            except ValueError:
                message = None
            raise SupabaseRestError(
                response.status_code,
                str(message or "Cloud data request failed"),
            )
        return response

    def select(
        self,
        resource: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        response = self.request("GET", resource, params=params)
        return response.json()

    def insert(
        self,
        resource: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        *,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        response = self.request(
            "POST",
            resource,
            params=params,
            json=payload,
            prefer="return=representation",
        )
        return response.json()

    def update(
        self,
        resource: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any],
        return_rows: bool = True,
    ) -> list[dict[str, Any]]:
        response = self.request(
            "PATCH",
            resource,
            params=params,
            json=payload,
            prefer="return=representation" if return_rows else "return=minimal,count=exact",
        )
        return response.json() if return_rows else []

    def update_count(
        self,
        resource: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any],
    ) -> int:
        response = self.request(
            "PATCH",
            resource,
            params=params,
            json=payload,
            prefer="return=minimal,count=exact",
        )
        content_range = response.headers.get("content-range", "*/0")
        try:
            return int(content_range.rsplit("/", 1)[1])
        except (IndexError, ValueError):
            return 0


def get_rest_client(user: AuthenticatedUser = Depends(require_user)) -> SupabaseRestClient:
    try:
        settings = get_settings()
    except SettingsError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return SupabaseRestClient(
        settings.supabase_url,
        settings.supabase_publishable_key,
        user.access_token,
    )
