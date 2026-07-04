from __future__ import annotations

import getpass
import subprocess

KEYCHAIN_ACCOUNT = "concert-tracker"
REFRESH_TOKEN_SERVICE = "Concert Tracker Backup Refresh Token"


def password_service(email: str) -> str:
    return f"Concert Tracker Password - {email.lower()}"


def read_secret(service: str) -> str:
    last_result: subprocess.CompletedProcess[str] | None = None
    for account in (KEYCHAIN_ACCOUNT, getpass.getuser()):
        result = subprocess.run(
            ["security", "find-generic-password", "-a", account, "-s", service, "-w"],
            check=False,
            capture_output=True,
            text=True,
        )
        last_result = result
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    if last_result is None:
        raise RuntimeError(f"Keychain lookup failed for {service}")
    raise subprocess.CalledProcessError(
        last_result.returncode,
        last_result.args,
        last_result.stdout,
        last_result.stderr,
    )


def write_secret(service: str, value: str) -> None:
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


def delete_secret(service: str) -> None:
    subprocess.run(
        ["security", "delete-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", service],
        check=False,
        capture_output=True,
        text=True,
    )
