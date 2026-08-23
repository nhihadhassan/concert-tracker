from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

APP_SUPPORT_NAME = "Concert Tracker Backup"
CONFIG_VERSION = 1


def backup_home() -> Path:
    override = os.getenv("CONCERT_TRACKER_BACKUP_HOME", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path.home() / "Library" / "Application Support" / APP_SUPPORT_NAME


def atomic_write_text(path: Path, value: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.chmod(mode)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


@dataclass(frozen=True)
class BackupConfig:
    project_root: str
    supabase_url: str
    publishable_key: str
    owner_email: str
    python_path: str
    node_path: str
    artifact_node_modules: str
    # Which backend to read from -- "supabase" or "neon" -- and its
    # credentials. Defaulted so existing persisted configs keep loading as
    # Supabase-only. See docs/DATA_PROVIDERS.md.
    data_provider: str = "supabase"
    supabase_secret_key: str = ""
    database_url: str = ""
    public_user_id: str = "11111111-1111-4111-8111-111111111111"
    version: int = CONFIG_VERSION

    @property
    def root(self) -> Path:
        return Path(self.project_root)

    @property
    def data_dir(self) -> Path:
        return self.root / "data"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def archive_dir(self) -> Path:
        return self.exports_dir / "archive"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    def validate(self) -> None:
        if self.version != CONFIG_VERSION:
            raise ValueError(f"Unsupported backup config version: {self.version}")
        if not self.supabase_url.startswith("https://"):
            raise ValueError("Supabase URL must use HTTPS")
        if not self.publishable_key:
            raise ValueError("Supabase publishable key is required")
        if self.data_provider not in {"supabase", "neon"}:
            raise ValueError(f"Unsupported data provider: {self.data_provider!r}")
        if self.data_provider == "neon" and not self.database_url:
            raise ValueError("database_url is required when data_provider is 'neon'")
        expected_owner = os.getenv("PUBLIC_USER_EMAIL", "").strip().lower()
        if expected_owner and self.owner_email.lower() != expected_owner:
            raise ValueError("The backup agent must authenticate as the configured owner")
        for label, value in (
            ("project root", self.project_root),
            ("Python", self.python_path),
            ("Node.js", self.node_path),
            ("artifact node_modules", self.artifact_node_modules),
        ):
            if not Path(value).exists():
                raise ValueError(f"Configured {label} path does not exist: {value}")


def config_path() -> Path:
    return backup_home() / "config.json"


def state_path() -> Path:
    return backup_home() / "state.json"


def save_config(config: BackupConfig) -> None:
    config.validate()
    atomic_write_text(config_path(), json.dumps(asdict(config), indent=2, sort_keys=True) + "\n")


def load_config() -> BackupConfig:
    path = config_path()
    if not path.exists():
        raise FileNotFoundError(
            f"Backup configuration is missing. Run python -m sync.launchd install first: {path}"
        )
    config = BackupConfig(**json.loads(path.read_text(encoding="utf-8")))
    config.validate()
    return config
