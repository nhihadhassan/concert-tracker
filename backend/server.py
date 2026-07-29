from typing import Literal

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from backend.album_routes import router as album_router
from backend.artwork_routes import router as artwork_router
from backend.calculation_routes import router as calculation_router
from backend.genius_routes import router as genius_router
from backend.identity import PublicUser, current_user
from backend.library_routes import router as library_router
from backend.settings import SettingsError, get_settings
from backend.spotify_routes import router as spotify_router


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    data_mode: Literal["fixtures", "staging"]


class SessionResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    data_mode: Literal["staging"] = "staging"


app = FastAPI(
    title="Concert Tracker API",
    version="0.3.0",
    docs_url="/v1/docs",
    openapi_url="/v1/openapi.json",
)

app.include_router(calculation_router)
app.include_router(library_router)
app.include_router(album_router)
app.include_router(artwork_router)
app.include_router(spotify_router)
app.include_router(genius_router)


@app.get("/v1/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    try:
        get_settings()
        data_mode = "staging"
    except SettingsError:
        data_mode = "fixtures"
    return HealthResponse(
        status="ok",
        service="concert-tracker-api",
        version=app.version,
        data_mode=data_mode,
    )


@app.get("/v1/session", response_model=SessionResponse, tags=["system"])
def session(user: PublicUser = Depends(current_user)) -> SessionResponse:
    return SessionResponse(
        user_id=str(user.user_id),
        email=user.email,
        display_name=user.display_name,
    )
