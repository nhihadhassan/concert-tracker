from __future__ import annotations

import argparse
import fcntl
import json
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sync.cloud import fetch_library
from sync.config import atomic_write_text, backup_home, load_config, state_path
from sync.storage import build_dataset, write_backup_artifacts

LOGGER = logging.getLogger("concert_tracker_backup")
MAX_BACKUP_AGE = timedelta(hours=24)


def configure_logging(log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    LOGGER.setLevel(logging.INFO)
    LOGGER.handlers.clear()
    stream = logging.StreamHandler()
    stream.setFormatter(formatter)
    LOGGER.addHandler(stream)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)


def read_state(path: Path | None = None) -> dict:
    target = path or state_path()
    if not target.exists():
        return {}
    return json.loads(target.read_text(encoding="utf-8"))


def backup_is_due(state: dict, now: datetime) -> bool:
    value = state.get("last_success_at")
    if not value:
        return True
    try:
        last_success = datetime.fromisoformat(str(value))
    except ValueError:
        return True
    if last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=timezone.utc)
    return now - last_success.astimezone(timezone.utc) >= MAX_BACKUP_AGE


@contextmanager
def exclusive_backup_lock() -> Iterator[None]:
    lock_path = backup_home() / "backup.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("Another Concert Tracker backup is already running") from exc
        yield


def run_backup(*, scheduled: bool, render_dir: Path | None = None) -> int:
    config = load_config()
    configure_logging(config.log_dir / "backup.log")
    now = datetime.now(timezone.utc)
    if scheduled and not backup_is_due(read_state(), now):
        LOGGER.info("Backup is current; scheduled catch-up skipped")
        return 0

    with exclusive_backup_lock():
        LOGGER.info("Starting %s backup", "scheduled" if scheduled else "manual")
        library = fetch_library(config)
        fetched_at = datetime.now(timezone.utc)
        dataset = build_dataset(
            library,
            fetched_at=fetched_at,
            source_url=config.supabase_url,
            owner_email=config.owner_email,
        )
        artifacts = write_backup_artifacts(dataset, config, render_dir=render_dir)
        state = {
            "last_success_at": fetched_at.isoformat(),
            "sqlite_path": str(artifacts.sqlite_path),
            "workbook_path": str(artifacts.workbook_path),
            "archive_path": str(artifacts.archive_path),
            "counts": artifacts.counts,
            "checksums": artifacts.checksums,
        }
        atomic_write_text(state_path(), json.dumps(state, indent=2, sort_keys=True) + "\n")
        LOGGER.info(
            "Backup complete: %s concerts, %s attendees, %s reviews, %s albums",
            artifacts.counts["concerts"],
            artifacts.counts["attendees"],
            artifacts.counts["reviews"],
            artifacts.counts["albums"],
        )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Back up Concert Tracker cloud data locally.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--now", action="store_true", help="Run a backup immediately.")
    mode.add_argument(
        "--scheduled",
        action="store_true",
        help="Run only when the last successful backup is at least 24 hours old.",
    )
    parser.add_argument(
        "--render-dir",
        type=Path,
        help="Render every workbook sheet for checkpoint verification.",
    )
    args = parser.parse_args()
    try:
        exit_code = run_backup(scheduled=args.scheduled, render_dir=args.render_dir)
    except Exception:
        if not LOGGER.handlers:
            logging.basicConfig(level=logging.ERROR)
        LOGGER.exception("Backup failed; previous recovery copies were left unchanged")
        exit_code = 1
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
