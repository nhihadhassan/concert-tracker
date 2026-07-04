#!/usr/bin/env python3
"""Create the two staging auth users and their app membership rows."""

from __future__ import annotations

import argparse
import getpass
import os
import secrets
import string
import subprocess
from dataclasses import dataclass

import httpx

KEYCHAIN_ACCOUNT = "concert-tracker"
SERVICE_KEY_SERVICE = "Concert Tracker Supabase Service Role"
MEMBERS = (
    ("owner@example.com", "Nhihad"),
    ("partner@example.com", "Rachel"),
)


@dataclass(frozen=True)
class StagingConfig:
    url: str
    service_key: str


def keychain_password_service(email: str) -> str:
    return f"Concert Tracker Password - {email}"


def read_keychain(service: str) -> str:
    for account in (KEYCHAIN_ACCOUNT, getpass.getuser()):
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                account,
                "-s",
                service,
                "-w",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    raise subprocess.CalledProcessError(
        result.returncode,
        result.args,
        result.stdout,
        result.stderr,
    )


def write_keychain(service: str, value: str) -> None:
    subprocess.run(
        [
            "security",
            "add-generic-password",
            "-U",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            service,
            "-w",
            value,
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def load_config() -> StagingConfig:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        raise SystemExit("Set SUPABASE_URL to the configured Supabase project URL.")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_key:
        try:
            service_key = read_keychain(SERVICE_KEY_SERVICE)
        except subprocess.CalledProcessError as exc:
            raise SystemExit(
                "Set SUPABASE_SERVICE_ROLE_KEY or add it to Keychain service: "
                f"{SERVICE_KEY_SERVICE}"
            ) from exc
    return StagingConfig(url=url, service_key=service_key)


def generate_password() -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(24))
        if (
            any(char.islower() for char in password)
            and any(char.isupper() for char in password)
            and any(char.isdigit() for char in password)
            and any(char in "!@#$%^&*" for char in password)
        ):
            return password


def member_password(email: str, generate: bool) -> str:
    if generate:
        password = generate_password()
    else:
        first = getpass.getpass(f"New Concert Tracker password for {email}: ")
        second = getpass.getpass("Confirm password: ")
        if first != second:
            raise SystemExit(f"Passwords did not match for {email}.")
        if len(first) < 12:
            raise SystemExit("Passwords must contain at least 12 characters.")
        password = first
    write_keychain(keychain_password_service(email), password)
    return password


def admin_headers(config: StagingConfig) -> dict[str, str]:
    return {
        "apikey": config.service_key,
        "Authorization": f"Bearer {config.service_key}",
        "Content-Type": "application/json",
    }


def list_users(client: httpx.Client, config: StagingConfig) -> dict[str, str]:
    response = client.get(
        f"{config.url}/auth/v1/admin/users",
        headers=admin_headers(config),
        params={"page": 1, "per_page": 1000},
    )
    response.raise_for_status()
    return {row["email"].lower(): row["id"] for row in response.json().get("users", [])}


def provision_user(
    client: httpx.Client,
    config: StagingConfig,
    email: str,
    password: str,
    existing_users: dict[str, str],
) -> str:
    payload = {"email": email, "password": password, "email_confirm": True}
    user_id = existing_users.get(email)
    if user_id:
        response = client.put(
            f"{config.url}/auth/v1/admin/users/{user_id}",
            headers=admin_headers(config),
            json=payload,
        )
    else:
        response = client.post(
            f"{config.url}/auth/v1/admin/users",
            headers=admin_headers(config),
            json=payload,
        )
    response.raise_for_status()
    return response.json()["id"]


def upsert_members(
    client: httpx.Client,
    config: StagingConfig,
    members: list[dict[str, str]],
) -> None:
    headers = admin_headers(config) | {"Prefer": "resolution=merge-duplicates,return=minimal"}
    response = client.post(
        f"{config.url}/rest/v1/app_members",
        headers=headers,
        params={"on_conflict": "user_id"},
        json=members,
    )
    response.raise_for_status()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--generate",
        action="store_true",
        help="Generate strong passwords and keep them in macOS Keychain.",
    )
    args = parser.parse_args()
    config = load_config()

    with httpx.Client(timeout=15) as client:
        existing_users = list_users(client, config)
        member_rows = []
        for email, display_name in MEMBERS:
            password = member_password(email, args.generate)
            user_id = provision_user(client, config, email, password, existing_users)
            member_rows.append(
                {
                    "user_id": user_id,
                    "email": email,
                    "display_name": display_name,
                    "is_active": True,
                }
            )
        upsert_members(client, config, member_rows)

    mode = "generated and stored" if args.generate else "stored"
    print(f"Provisioned Nhihad and Rachel; passwords were {mode} in macOS Keychain.")


if __name__ == "__main__":
    main()
