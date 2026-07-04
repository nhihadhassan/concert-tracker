from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from backend.library_routes import build_library
from backend.supabase_rest import SupabaseRestClient
from sync.config import BackupConfig
from sync.keychain import REFRESH_TOKEN_SERVICE, password_service, read_secret, write_secret


class SecretStore(Protocol):
    def read(self, service: str) -> str: ...

    def write(self, service: str, value: str) -> None: ...


class KeychainSecretStore:
    def read(self, service: str) -> str:
        return read_secret(service)

    def write(self, service: str, value: str) -> None:
        write_secret(service, value)


@dataclass(frozen=True)
class AuthSession:
    access_token: str
    refresh_token: str
    user_id: str
    email: str


def _session_from_response(response: httpx.Response, expected_email: str) -> AuthSession:
    response.raise_for_status()
    payload = response.json()
    user = payload.get("user") or {}
    email = str(user.get("email", "")).lower()
    if email != expected_email.lower():
        raise RuntimeError("Supabase returned a session for the wrong backup account")
    return AuthSession(
        access_token=str(payload["access_token"]),
        refresh_token=str(payload["refresh_token"]),
        user_id=str(user["id"]),
        email=email,
    )


def authenticate(
    config: BackupConfig,
    *,
    client: httpx.Client | None = None,
    secrets: SecretStore | None = None,
) -> AuthSession:
    secret_store = secrets or KeychainSecretStore()
    owns_client = client is None
    http = client or httpx.Client(timeout=20)
    headers = {"apikey": config.publishable_key, "Content-Type": "application/json"}
    try:
        try:
            refresh_token = secret_store.read(REFRESH_TOKEN_SERVICE)
        except (subprocess.CalledProcessError, RuntimeError):
            refresh_token = ""

        session: AuthSession | None = None
        if refresh_token:
            response = http.post(
                f"{config.supabase_url}/auth/v1/token",
                params={"grant_type": "refresh_token"},
                headers=headers,
                json={"refresh_token": refresh_token},
            )
            if response.status_code < 400:
                session = _session_from_response(response, config.owner_email)

        if session is None:
            password = secret_store.read(password_service(config.owner_email))
            response = http.post(
                f"{config.supabase_url}/auth/v1/token",
                params={"grant_type": "password"},
                headers=headers,
                json={"email": config.owner_email, "password": password},
            )
            session = _session_from_response(response, config.owner_email)

        secret_store.write(REFRESH_TOKEN_SERVICE, session.refresh_token)
        return session
    finally:
        if owns_client:
            http.close()


def fetch_library(config: BackupConfig, session: AuthSession) -> dict[str, Any]:
    rest = SupabaseRestClient(
        config.supabase_url,
        config.publishable_key,
        session.access_token,
    )
    library = build_library(rest, session.user_id)
    members = {member.email.lower() for member in library.members}
    if config.owner_email.lower() not in members:
        raise RuntimeError("The authenticated backup owner is not an active app member")
    return library.model_dump(mode="json")
