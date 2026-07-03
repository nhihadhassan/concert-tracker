#!/usr/bin/env python3
"""Exercise the production shared-concert workflow and remove the test fixture."""

from __future__ import annotations

import argparse
import os
import subprocess
from dataclasses import dataclass
from uuid import uuid4

import httpx

from scripts.stage2_setup import MEMBERS, keychain_password_service, read_keychain


@dataclass(frozen=True)
class Session:
    email: str
    user_id: str
    access_token: str


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip().rstrip("/")
    if not value:
        raise SystemExit(f"Set {name} before running Stage 8 verification.")
    return value


def sign_in(client: httpx.Client, supabase_url: str, publishable_key: str, email: str) -> Session:
    try:
        password = read_keychain(keychain_password_service(email))
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Missing Keychain password for {email}") from exc
    response = client.post(
        f"{supabase_url}/auth/v1/token",
        headers={"apikey": publishable_key},
        params={"grant_type": "password"},
        json={"email": email, "password": password},
    )
    response.raise_for_status()
    body = response.json()
    return Session(email, body["user"]["id"], body["access_token"])


def api_headers(session: Session, mutation_id: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {session.access_token}"}
    if mutation_id:
        headers["Idempotency-Key"] = mutation_id
    return headers


def expect(response: httpx.Response, status: int, label: str) -> dict:
    if response.status_code != status:
        raise AssertionError(
            f"{label}: expected HTTP {status}, got {response.status_code}: {response.text}"
        )
    return response.json()


def library(client: httpx.Client, api_url: str, session: Session) -> dict:
    return expect(
        client.get(f"{api_url}/library", headers=api_headers(session)),
        200,
        f"{session.email} library",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api-url",
        default="https://concert-tracker-sepia.vercel.app/api/v1",
        help="Production API prefix including /api/v1.",
    )
    parser.add_argument("--expected-count", type=int, default=46)
    args = parser.parse_args()
    api_url = args.api_url.rstrip("/")
    supabase_url = require_env("SUPABASE_URL")
    publishable_key = require_env("SUPABASE_PUBLISHABLE_KEY")

    with httpx.Client(timeout=30) as client:
        sessions = {
            email: sign_in(client, supabase_url, publishable_key, email) for email, _ in MEMBERS
        }
        nhihad = sessions["owner@example.com"]
        rachel = sessions["partner@example.com"]
        before = library(client, api_url, nhihad)
        assert len(before["concerts"]) == args.expected_count
        assert {row["email"] for row in before["members"]} == set(sessions)

        concert_id = str(uuid4())
        create_key = str(uuid4())
        create_payload = {
            "id": concert_id,
            "artist": "Stage 8 Verification",
            "tour": "Production Cutover Check",
            "date": "2031-07-03",
            "venue": "Automated Verification",
            "price": 0,
            "genre": "Test",
            "projected": 8,
            "seat": "Verification",
            "status": "Attended",
            "type": "Concert",
            "spotify_url": None,
            "image": None,
            "notes": "Temporary Stage 8 workflow record",
            "companions": "Rachel",
            "attendee_user_ids": [nhihad.user_id, rachel.user_id],
            "review": {
                "id": str(uuid4()),
                "expected_row_version": None,
                "enjoyment_score": 9,
                "stage_score": 8,
                "setlist_score": 8,
                "seat_score": 7,
                "override_rating": None,
                "override_reason": None,
                "notes": "Nhihad Stage 8 review",
            },
        }
        try:
            expect(
                client.post(
                    f"{api_url}/concerts",
                    headers=api_headers(nhihad, create_key),
                    json=create_payload,
                ),
                200,
                "Nhihad create",
            )
            replay = expect(
                client.post(
                    f"{api_url}/concerts",
                    headers=api_headers(nhihad, create_key),
                    json=create_payload,
                ),
                200,
                "idempotent create replay",
            )
            assert replay["replayed"] is True

            rachel_view = library(client, api_url, rachel)
            shared = next(row for row in rachel_view["concerts"] if row["id"] == concert_id)
            assert {row["user_id"] for row in shared["attendees"]} == {
                nhihad.user_id,
                rachel.user_id,
            }

            expect(
                client.put(
                    f"{api_url}/concerts/{concert_id}/review",
                    headers=api_headers(rachel, str(uuid4())),
                    json={
                        "id": str(uuid4()),
                        "expected_row_version": None,
                        "enjoyment_score": 10,
                        "stage_score": 9,
                        "setlist_score": 9,
                        "seat_score": 8,
                        "override_rating": None,
                        "override_reason": None,
                        "notes": "Rachel Stage 8 review",
                    },
                ),
                200,
                "Rachel review",
            )
            update_payload = {
                key: shared[key]
                for key in (
                    "artist",
                    "tour",
                    "date",
                    "venue",
                    "price",
                    "genre",
                    "projected",
                    "seat",
                    "status",
                    "type",
                    "spotify_url",
                    "image",
                    "notes",
                    "companions",
                )
            }
            update_payload["notes"] = "Updated by Rachel during Stage 8 verification"
            update_payload["expected_row_version"] = shared["row_version"]
            updated = expect(
                client.patch(
                    f"{api_url}/concerts/{concert_id}",
                    headers=api_headers(rachel, str(uuid4())),
                    json=update_payload,
                ),
                200,
                "Rachel shared edit",
            )

            stale = client.patch(
                f"{api_url}/concerts/{concert_id}",
                headers=api_headers(nhihad, str(uuid4())),
                json={**update_payload, "notes": "stale write"},
            )
            assert stale.status_code == 409, f"stale write returned {stale.status_code}"

            csv_response = client.get(f"{api_url}/concerts/export.csv", headers=api_headers(rachel))
            assert csv_response.status_code == 200
            assert "Stage 8 Verification" in csv_response.text

            combined = next(
                row
                for row in library(client, api_url, nhihad)["concerts"]
                if row["id"] == concert_id
            )
            assert len(combined["reviews"]) == 2
            assert combined["combined_rating"] is not None

            expect(
                client.delete(
                    f"{api_url}/concerts/{concert_id}",
                    headers=api_headers(nhihad, str(uuid4())),
                    params={"expected_row_version": updated["resource_row_version"]},
                ),
                200,
                "Nhihad soft delete",
            )
        finally:
            after = library(client, api_url, nhihad)
            remaining = [row for row in after["concerts"] if row["id"] == concert_id]
            if remaining:
                row = remaining[0]
                client.delete(
                    f"{api_url}/concerts/{concert_id}",
                    headers=api_headers(nhihad, str(uuid4())),
                    params={"expected_row_version": row["row_version"]},
                )

        nhihad_after = library(client, api_url, nhihad)
        rachel_after = library(client, api_url, rachel)
        assert len(nhihad_after["concerts"]) == args.expected_count
        assert len(rachel_after["concerts"]) == args.expected_count

    print(
        "Stage 8 production workflow passed for Nhihad and Rachel; "
        f"active library restored to {args.expected_count} concerts."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
