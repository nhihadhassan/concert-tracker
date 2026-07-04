#!/usr/bin/env python3
"""Exercise Stage 2 Auth and RLS as Nhihad, Rachel, anonymous, and an outsider."""

from __future__ import annotations

import argparse
import os
import subprocess
from dataclasses import dataclass
from uuid import uuid4

import httpx
from stage2_setup import (
    MEMBERS,
    SERVICE_KEY_SERVICE,
    keychain_password_service,
    read_keychain,
)


@dataclass(frozen=True)
class Session:
    email: str
    user_id: str
    access_token: str


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip().rstrip("/")
    if not value:
        raise SystemExit(f"Set {name} before running the live Stage 2 verification.")
    return value


def sign_in(client: httpx.Client, url: str, publishable_key: str, email: str) -> Session:
    try:
        password = read_keychain(keychain_password_service(email))
    except subprocess.CalledProcessError as exc:
        service = keychain_password_service(email)
        raise SystemExit(f"Missing Keychain password service: {service}") from exc
    response = client.post(
        f"{url}/auth/v1/token",
        headers={"apikey": publishable_key},
        params={"grant_type": "password"},
        json={"email": email, "password": password},
    )
    response.raise_for_status()
    body = response.json()
    return Session(email=email, user_id=body["user"]["id"], access_token=body["access_token"])


def headers(publishable_key: str, token: str | None = None) -> dict[str, str]:
    result = {"apikey": publishable_key, "Content-Type": "application/json"}
    if token:
        result["Authorization"] = f"Bearer {token}"
    return result


def expect_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected {expected}, got {response.status_code}: {response.text}"
        )


def verify_private_reads(
    client: httpx.Client,
    url: str,
    publishable_key: str,
    sessions: list[Session],
) -> None:
    tables = (
        "app_members",
        "rating_rule_versions",
        "concerts",
        "concert_attendees",
        "concert_reviews",
    )
    for table in tables:
        anonymous = client.get(f"{url}/rest/v1/{table}", headers=headers(publishable_key))
        assert anonymous.status_code in {
            200,
            401,
            403,
        }, f"anonymous {table} read returned {anonymous.status_code}"
        if anonymous.status_code == 200:
            assert anonymous.json() == [], f"anonymous {table} read exposed rows"
        for session in sessions:
            member_read = client.get(
                f"{url}/rest/v1/{table}",
                headers=headers(publishable_key, session.access_token),
            )
            expect_status(member_read, 200, f"{session.email} {table} read")

    for session in sessions:
        members = client.get(
            f"{url}/rest/v1/app_members",
            headers=headers(publishable_key, session.access_token),
            params={"select": "email"},
        ).json()
        assert {row["email"].lower() for row in members} == {email for email, _ in MEMBERS}


def verify_mutations(
    client: httpx.Client,
    url: str,
    publishable_key: str,
    service_key: str,
    nhihad: Session,
    rachel: Session,
) -> None:
    concert_id = str(uuid4())
    nh_headers = headers(publishable_key, nhihad.access_token) | {"Prefer": "return=representation"}
    ra_headers = headers(publishable_key, rachel.access_token) | {"Prefer": "return=representation"}
    service_headers = headers(service_key, service_key)
    try:
        created = client.post(
            f"{url}/rest/v1/concerts",
            headers=nh_headers,
            json={
                "id": concert_id,
                "artist": "Stage 2 RLS Check",
                "concert_date": "2030-01-02",
                "venue": "Staging Only",
                "created_by": nhihad.user_id,
            },
        )
        expect_status(created, 201, "Nhihad concert insert")

        rachel_update = client.patch(
            f"{url}/rest/v1/concerts",
            headers=ra_headers,
            params={"id": f"eq.{concert_id}"},
            json={"notes": "Updated by Rachel during Stage 2 verification"},
        )
        expect_status(rachel_update, 200, "Rachel shared concert update")

        for session, session_headers in ((nhihad, nh_headers), (rachel, ra_headers)):
            attendee = client.post(
                f"{url}/rest/v1/concert_attendees",
                headers=session_headers,
                json={
                    "concert_id": concert_id,
                    "user_id": session.user_id,
                    "created_by": session.user_id,
                },
            )
            expect_status(attendee, 201, f"{session.email} attendee insert")

        review_ids: dict[str, str] = {}
        for session, session_headers in ((nhihad, nh_headers), (rachel, ra_headers)):
            review_id = str(uuid4())
            review_ids[session.email] = review_id
            review = client.post(
                f"{url}/rest/v1/concert_reviews",
                headers=session_headers,
                json={
                    "id": review_id,
                    "concert_id": concert_id,
                    "reviewer_user_id": session.user_id,
                    "enjoyment_score": 9,
                    "created_by": session.user_id,
                },
            )
            expect_status(review, 201, f"{session.email} own review insert")

        cross_update = client.patch(
            f"{url}/rest/v1/concert_reviews",
            headers=ra_headers,
            params={"id": f"eq.{review_ids[nhihad.email]}"},
            json={"enjoyment_score": 1},
        )
        expect_status(cross_update, 200, "Rachel cross-review update")
        assert cross_update.json() == [], "Rachel changed Nhihad's private review ownership row"

        forbidden_member_write = client.patch(
            f"{url}/rest/v1/app_members",
            headers=ra_headers,
            params={"user_id": f"eq.{nhihad.user_id}"},
            json={"display_name": "Not allowed"},
        )
        assert forbidden_member_write.status_code in {
            401,
            403,
        }, "member administration was writable"

        forbidden_delete = client.delete(
            f"{url}/rest/v1/concerts",
            headers=nh_headers,
            params={"id": f"eq.{concert_id}"},
        )
        assert forbidden_delete.status_code in {401, 403}, "physical concert delete was allowed"
    finally:
        client.delete(
            f"{url}/rest/v1/concerts",
            headers=service_headers,
            params={"id": f"eq.{concert_id}"},
        ).raise_for_status()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api-url",
        default=os.getenv("CONCERT_TRACKER_API_URL", "http://127.0.0.1:3000/api/v1"),
        help="FastAPI route prefix, including /api/v1.",
    )
    args = parser.parse_args()
    url = require_env("SUPABASE_URL")
    publishable_key = require_env("SUPABASE_PUBLISHABLE_KEY")
    try:
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip() or read_keychain(
            SERVICE_KEY_SERVICE
        )
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Missing Keychain service: {SERVICE_KEY_SERVICE}") from exc

    with httpx.Client(timeout=15) as client:
        sessions = [sign_in(client, url, publishable_key, email) for email, _ in MEMBERS]
        nhihad, rachel = sessions
        verify_private_reads(client, url, publishable_key, sessions)
        verify_mutations(client, url, publishable_key, service_key, nhihad, rachel)

        outsider = client.post(
            f"{url}/auth/v1/signup",
            headers=headers(publishable_key),
            json={"email": f"stage2-{uuid4()}@example.com", "password": "Blocked!Pass123"},
        )
        assert outsider.status_code in {400, 403, 422}, "public signup is still enabled"

        invalid = client.get(
            f"{args.api_url.rstrip('/')}/session",
            headers={"Authorization": "Bearer invalid-stage-two-token"},
        )
        expect_status(invalid, 401, "invalid API token")
        for session in sessions:
            verified = client.get(
                f"{args.api_url.rstrip('/')}/session",
                headers={"Authorization": f"Bearer {session.access_token}"},
            )
            expect_status(verified, 200, f"{session.email} API session")

    print("Stage 2 live Auth, API, and RLS verification passed for both members.")


if __name__ == "__main__":
    main()
