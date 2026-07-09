import os
from dataclasses import dataclass
from functools import lru_cache


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_publishable_key: str
    allowed_emails: frozenset[str]
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = ""
    genius_access_token: str = ""

    @property
    def issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.issuer}/.well-known/jwks.json"

    @property
    def spotify_configured(self) -> bool:
        return bool(
            self.spotify_client_id
            and self.spotify_client_secret
            and self.spotify_redirect_uri
        )

    @classmethod
    def from_environment(cls) -> "Settings":
        supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        publishable_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        allowed_emails = frozenset(
            email.strip().lower()
            for email in os.getenv(
                "ALLOWED_EMAILS",
                "owner@example.com,partner@example.com",
            ).split(",")
            if email.strip()
        )
        if not supabase_url or not publishable_key:
            raise SettingsError("Supabase staging environment is not configured")
        return cls(
            supabase_url=supabase_url,
            supabase_publishable_key=publishable_key,
            allowed_emails=allowed_emails,
            spotify_client_id=os.getenv("SPOTIFY_CLIENT_ID", "").strip(),
            spotify_client_secret=os.getenv("SPOTIFY_CLIENT_SECRET", "").strip(),
            spotify_redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI", "").strip(),
            genius_access_token=os.getenv("GENIUS_ACCESS_TOKEN", "").strip(),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_environment()
