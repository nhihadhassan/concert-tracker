from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import auth
from backend.members import AppMember, require_member
from backend.server import app
from backend.settings import Settings


class FakeSigningKey:
    def __init__(self, key: object) -> None:
        self.key = key


class FakeJwkClient:
    def __init__(self, key: object) -> None:
        self.signing_key = FakeSigningKey(key)

    def get_signing_key_from_jwt(self, token: str) -> FakeSigningKey:
        assert token
        return self.signing_key


def make_token(private_key: object, **overrides: object) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "aud": "authenticated",
        "iss": "https://staging.supabase.co/auth/v1",
        "sub": "11111111-1111-4111-8111-111111111111",
        "email": "owner@example.com",
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=30)).timestamp()),
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": "test-key"})


@pytest.fixture
def token_setup(monkeypatch: pytest.MonkeyPatch) -> tuple[object, Settings]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    settings = Settings(
        supabase_url="https://staging.supabase.co",
        supabase_publishable_key="sb_publishable_test",
        allowed_emails=frozenset({"owner@example.com", "partner@example.com"}),
    )
    monkeypatch.setattr(auth, "get_jwk_client", lambda _: FakeJwkClient(public_key))
    return private_key, settings


def test_valid_supabase_token_is_accepted(token_setup: tuple[object, Settings]) -> None:
    private_key, settings = token_setup

    claims = auth.decode_access_token(make_token(private_key), settings)

    assert claims["email"] == "owner@example.com"
    assert claims["role"] == "authenticated"


def test_expired_token_is_rejected(token_setup: tuple[object, Settings]) -> None:
    private_key, settings = token_setup
    expired = int((datetime.now(timezone.utc) - timedelta(minutes=1)).timestamp())

    with pytest.raises(HTTPException) as error:
        auth.decode_access_token(make_token(private_key, exp=expired), settings)

    assert error.value.status_code == 401


def test_unlisted_email_is_rejected(token_setup: tuple[object, Settings]) -> None:
    private_key, settings = token_setup

    with pytest.raises(HTTPException) as error:
        auth.decode_access_token(make_token(private_key, email="outsider@example.com"), settings)

    assert error.value.status_code == 403


def test_session_requires_bearer_token() -> None:
    response = TestClient(app).get("/v1/session")

    assert response.status_code == 401


def test_session_returns_verified_member() -> None:
    app.dependency_overrides[require_member] = lambda: AppMember(
        user_id="11111111-1111-4111-8111-111111111111",
        email="owner@example.com",
        display_name="Nhihad",
        is_active=True,
    )
    try:
        response = TestClient(app).get("/v1/session")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["display_name"] == "Nhihad"
    assert response.json()["data_mode"] == "staging"
