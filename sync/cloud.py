from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.album_routes import build_album_library
from backend.library_routes import build_library
from backend.supabase_rest import SupabaseRestClient
from sync.config import BackupConfig


def _rest_client(config: BackupConfig) -> SupabaseRestClient:
    """Builds the same kind of client the deployed backend uses for the
    configured provider (see backend/supabase_rest.py's get_rest_client()).

    No per-user sign-in: the app itself has had no auth since Stage 8 --
    production reads with a single configured credential (the Supabase
    secret key, or a direct Neon connection string) rather than a per-user
    session, so there is nothing to authenticate as here either.
    """
    if config.data_provider == "neon":
        from backend.neon_rest import NeonRestClient

        return NeonRestClient(config.database_url, UUID(config.public_user_id))
    return SupabaseRestClient(
        config.supabase_url,
        config.supabase_secret_key or config.publishable_key,
    )


def fetch_library(config: BackupConfig) -> dict[str, Any]:
    rest = _rest_client(config)
    library = build_library(rest, config.public_user_id)
    members = {member.email.lower() for member in library.members}
    if config.owner_email.lower() not in members:
        raise RuntimeError("The configured backup owner is not an active app member")
    payload = library.model_dump(mode="json")
    payload["albums"] = build_album_library(rest).model_dump(mode="json")["albums"]
    return payload
