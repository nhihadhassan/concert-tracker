from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    data_mode: Literal["fixtures"]


app = FastAPI(
    title="Concert Tracker API",
    version="0.1.0",
    docs_url="/v1/docs",
    openapi_url="/v1/openapi.json",
)


@app.get("/v1/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="concert-tracker-api",
        version=app.version,
        data_mode="fixtures",
    )
