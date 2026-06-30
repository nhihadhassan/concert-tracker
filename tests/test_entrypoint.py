from api import app


def test_vercel_entrypoint_exports_fastapi_app() -> None:
    assert app.title == "Concert Tracker API"
    assert app.version == "0.2.0"
