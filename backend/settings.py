import os
from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

DEFAULT_PUBLIC_USER_ID = "11111111-1111-4111-8111-111111111111"


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str = ""
    public_user_id: UUID = UUID(DEFAULT_PUBLIC_USER_ID)
    public_user_email: str = "owner@example.com"
    public_user_display_name: str = "Nhihad"
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = ""
    genius_access_token: str = ""
    tavily_api_key: str = ""
    gemini_api_key: str = ""
    ticketmaster_api_key: str = ""
    seatgeek_client_id: str = ""
    seatgeek_client_secret: str = ""
    setlistfm_api_key: str = ""
    data_provider: str = "supabase"
    database_url: str = ""

    @property
    def rest_key(self) -> str:
        """Key used for PostgREST calls.

        With sign-in removed there is no per-user JWT, so the secret (service
        role) key is what reaches the data behind the RLS policies. The
        publishable key stays as a fallback for fixture and local setups.
        """
        return self.supabase_secret_key or self.supabase_publishable_key

    @property
    def spotify_configured(self) -> bool:
        return bool(
            self.spotify_client_id and self.spotify_client_secret and self.spotify_redirect_uri
        )

    @classmethod
    def from_environment(cls) -> "Settings":
        supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        publishable_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        if not supabase_url or not publishable_key:
            raise SettingsError("Supabase staging environment is not configured")

        raw_user_id = os.getenv("PUBLIC_USER_ID", DEFAULT_PUBLIC_USER_ID).strip()
        try:
            public_user_id = UUID(raw_user_id)
        except ValueError as exc:
            raise SettingsError("PUBLIC_USER_ID must be a UUID") from exc

        return cls(
            supabase_url=supabase_url,
            supabase_publishable_key=publishable_key,
            supabase_secret_key=os.getenv("SUPABASE_SECRET_KEY", "").strip(),
            public_user_id=public_user_id,
            public_user_email=os.getenv("PUBLIC_USER_EMAIL", "owner@example.com")
            .strip()
            .lower(),
            public_user_display_name=os.getenv("PUBLIC_USER_DISPLAY_NAME", "Nhihad").strip(),
            spotify_client_id=os.getenv("SPOTIFY_CLIENT_ID", "").strip(),
            spotify_client_secret=os.getenv("SPOTIFY_CLIENT_SECRET", "").strip(),
            spotify_redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI", "").strip(),
            genius_access_token=os.getenv("GENIUS_ACCESS_TOKEN", "").strip(),
            tavily_api_key=os.getenv("TAVILY_API_KEY", "").strip(),
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
            ticketmaster_api_key=os.getenv("TICKETMASTER_API_KEY", "").strip(),
            seatgeek_client_id=os.getenv("SEATGEEK_CLIENT_ID", "").strip(),
            seatgeek_client_secret=os.getenv("SEATGEEK_CLIENT_SECRET", "").strip(),
            setlistfm_api_key=os.getenv("SETLISTFM_API_KEY", "").strip(),
            data_provider=os.getenv("DATA_PROVIDER", "supabase").strip().lower() or "supabase",
            database_url=os.getenv("DATABASE_URL", "").strip(),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_environment()
