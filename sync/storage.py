from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from sync.config import BackupConfig, atomic_write_text, backup_home

SCHEMA_VERSION = 1
ARCHIVE_RETENTION = 30

TABLE_COLUMNS = {
    "members": ["user_id", "email", "display_name"],
    "concerts": [
        "id",
        "artist",
        "tour",
        "date",
        "venue",
        "price",
        "genre",
        "projected",
        "seat",
        "status",
        "type",
        "spotify_url",
        "image",
        "notes",
        "companions",
        "row_version",
        "personal_rating",
        "combined_rating",
    ],
    "attendees": [
        "concert_id",
        "artist",
        "user_id",
        "display_name",
        "attendance_status",
        "row_version",
    ],
    "reviews": [
        "id",
        "concert_id",
        "artist",
        "reviewer_user_id",
        "reviewer_name",
        "enjoyment_score",
        "stage_score",
        "setlist_score",
        "seat_score",
        "override_rating",
        "override_reason",
        "notes",
        "calculated_rating",
        "final_rating",
        "is_overridden",
        "row_version",
    ],
    "rankings": ["scope", "rank", "concert_id", "artist", "concert_date", "rating"],
    "analytics": ["section", "key", "metric", "value_json"],
}


@dataclass(frozen=True)
class BackupDataset:
    rows: dict[str, list[dict[str, Any]]]
    metadata: dict[str, Any]


@dataclass(frozen=True)
class BackupArtifacts:
    sqlite_path: Path
    workbook_path: Path
    archive_path: Path
    counts: dict[str, int]
    checksums: dict[str, str]


def canonical_checksum(rows: list[dict[str, Any]]) -> str:
    ordered = sorted(rows, key=lambda row: json.dumps(row, sort_keys=True, default=str))
    payload = json.dumps(
        ordered,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _analytics_rows(analytics: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    def add(section: str, key: str, metric: str, value: Any) -> None:
        rows.append(
            {
                "section": section,
                "key": key,
                "metric": metric,
                "value_json": json.dumps(value, sort_keys=True, separators=(",", ":")),
            }
        )

    for metric in ("total_concerts", "date_first", "date_last"):
        add("overview", "library", metric, analytics.get(metric))
    for key, value in sorted(analytics.get("status_counts", {}).items()):
        add("status", key, "concerts", value)
    for metric, value in sorted(analytics.get("spending", {}).items()):
        add("spending", "all", metric, value)
    for metric, value in sorted(analytics.get("projection", {}).items()):
        add("projection", "all", metric, value)
    for summary in analytics.get("rating_summaries", []):
        for metric in ("rated_concerts", "average_rating"):
            add("ratings", str(summary["scope"]), metric, summary.get(metric))
    for summary in analytics.get("yearly_trends", []):
        key = str(summary["year"])
        for metric in ("concerts", "attended", "total_spent", "average_combined_rating"):
            add("year", key, metric, summary.get(metric))
    for field, section in (
        ("artist_summaries", "artist"),
        ("genre_summaries", "genre"),
        ("venue_summaries", "venue"),
        ("repeat_artists", "repeat_artist"),
    ):
        for summary in analytics.get(field, []):
            for metric in ("concerts", "attended", "total_spent", "average_combined_rating"):
                add(section, str(summary["key"]), metric, summary.get(metric))
    return rows


def build_dataset(
    library: dict[str, Any],
    *,
    fetched_at: datetime,
    source_url: str,
    owner_email: str,
) -> BackupDataset:
    members = sorted(library["members"], key=lambda row: (row["email"], row["user_id"]))
    concerts: list[dict[str, Any]] = []
    attendees: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    for concert in sorted(library["concerts"], key=lambda row: (row["date"], row["id"])):
        concerts.append({column: concert.get(column) for column in TABLE_COLUMNS["concerts"]})
        for attendee in concert.get("attendees", []):
            attendees.append(
                {
                    "concert_id": concert["id"],
                    "artist": concert["artist"],
                    **attendee,
                }
            )
        for review in concert.get("reviews", []):
            row = {
                "id": review["id"],
                "concert_id": concert["id"],
                "artist": concert["artist"],
                **review,
            }
            row["is_overridden"] = int(bool(row["is_overridden"]))
            reviews.append(row)
    attendees.sort(key=lambda row: (row["concert_id"], row["user_id"]))
    reviews.sort(key=lambda row: (row["concert_id"], row["reviewer_user_id"]))

    rankings = []
    for scope, entries in sorted(library["analytics"].get("rankings", {}).items()):
        rankings.extend({"scope": scope, **entry} for entry in entries)
    rankings.sort(key=lambda row: (row["scope"], row["rank"], row["concert_id"]))

    rows = {
        "members": [
            {column: row.get(column) for column in TABLE_COLUMNS["members"]} for row in members
        ],
        "concerts": concerts,
        "attendees": [
            {column: row.get(column) for column in TABLE_COLUMNS["attendees"]} for row in attendees
        ],
        "reviews": [
            {column: row.get(column) for column in TABLE_COLUMNS["reviews"]} for row in reviews
        ],
        "rankings": [
            {column: row.get(column) for column in TABLE_COLUMNS["rankings"]} for row in rankings
        ],
        "analytics": _analytics_rows(library["analytics"]),
    }
    counts = {name: len(values) for name, values in rows.items()}
    checksums = {name: canonical_checksum(values) for name, values in rows.items()}
    metadata = {
        "schema_version": SCHEMA_VERSION,
        "fetched_at": fetched_at.isoformat(),
        "source_url": source_url,
        "owner_email": owner_email,
        "counts": counts,
        "checksums": checksums,
    }
    return BackupDataset(rows=rows, metadata=metadata)


def _create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        pragma foreign_keys = on;
        create table members (
          user_id text primary key, email text not null, display_name text not null
        );
        create table concerts (
          id text primary key, artist text not null, tour text, date text not null,
          venue text not null, price real, genre text, projected real, seat text,
          status text not null, type text not null, spotify_url text, image text,
          notes text, companions text, row_version integer not null,
          personal_rating real, combined_rating real
        );
        create table attendees (
          concert_id text not null, artist text not null, user_id text not null,
          display_name text not null, attendance_status text not null, row_version integer not null,
          primary key (concert_id, user_id)
        );
        create table reviews (
          id text primary key, concert_id text not null, artist text not null,
          reviewer_user_id text not null, reviewer_name text not null,
          enjoyment_score real, stage_score real, setlist_score real, seat_score real,
          override_rating real, override_reason text, notes text, calculated_rating real,
          final_rating real, is_overridden integer not null, row_version integer not null
        );
        create table rankings (
          scope text not null, rank integer not null, concert_id text not null,
          artist text not null, concert_date text not null, rating real not null,
          primary key (scope, rank, concert_id)
        );
        create table analytics (
          section text not null, key text not null, metric text not null, value_json text,
          primary key (section, key, metric)
        );
        create table sync_metadata (key text primary key, value_json text not null);
        """
    )
    connection.execute(f"pragma user_version = {SCHEMA_VERSION}")


def _insert_dataset(connection: sqlite3.Connection, dataset: BackupDataset) -> None:
    for table, columns in TABLE_COLUMNS.items():
        placeholders = ",".join("?" for _ in columns)
        sql = f"insert into {table} ({','.join(columns)}) values ({placeholders})"
        connection.executemany(
            sql,
            [[row.get(column) for column in columns] for row in dataset.rows[table]],
        )
    connection.executemany(
        "insert into sync_metadata (key, value_json) values (?, ?)",
        [
            (key, json.dumps(value, sort_keys=True, separators=(",", ":")))
            for key, value in sorted(dataset.metadata.items())
        ],
    )


def _read_table(connection: sqlite3.Connection, table: str) -> list[dict[str, Any]]:
    columns = TABLE_COLUMNS[table]
    rows = connection.execute(f"select {','.join(columns)} from {table}").fetchall()
    return [dict(zip(columns, row)) for row in rows]


def verify_sqlite(path: Path, dataset: BackupDataset) -> None:
    with sqlite3.connect(path) as connection:
        integrity = connection.execute("pragma integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity check failed: {integrity}")
        for table in TABLE_COLUMNS:
            rows = _read_table(connection, table)
            expected_count = dataset.metadata["counts"][table]
            if len(rows) != expected_count:
                raise RuntimeError(
                    f"SQLite {table} count mismatch: expected {expected_count}, found {len(rows)}"
                )
            checksum = canonical_checksum(rows)
            if checksum != dataset.metadata["checksums"][table]:
                raise RuntimeError(f"SQLite {table} checksum mismatch")


def write_sqlite_atomic(dataset: BackupDataset, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with sqlite3.connect(temporary) as connection:
            _create_schema(connection)
            _insert_dataset(connection, dataset)
            connection.commit()
        verify_sqlite(temporary, dataset)
        temporary.chmod(0o600)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copyfile(source, temporary)
        with temporary.open("rb") as handle:
            os.fsync(handle.fileno())
        temporary.chmod(0o600)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def prune_archives(directory: Path, retain: int = ARCHIVE_RETENTION) -> list[Path]:
    archives = sorted(directory.glob("concerts-*.xlsx"), reverse=True)
    removed = archives[retain:]
    for stale in removed:
        stale.unlink()
    return removed


def _workbook_payload(dataset: BackupDataset) -> dict[str, Any]:
    sheet_names = {
        "concerts": "Concerts",
        "attendees": "Attendees",
        "reviews": "Reviews",
        "rankings": "Rankings",
        "analytics": "Analytics",
    }
    sheets = []
    for table, sheet_name in sheet_names.items():
        sheets.append(
            {
                "name": sheet_name,
                "headers": TABLE_COLUMNS[table],
                "rows": [
                    [row.get(column) for column in TABLE_COLUMNS[table]]
                    for row in dataset.rows[table]
                ],
                "dateColumns": [
                    index
                    for index, column in enumerate(TABLE_COLUMNS[table])
                    if column in {"date", "concert_date"}
                ],
            }
        )
    metadata_rows = []
    for key, value in sorted(dataset.metadata.items()):
        if isinstance(value, (dict, list)):
            display_value = json.dumps(value, sort_keys=True)
        elif key == "fetched_at":
            display_value = datetime.fromisoformat(str(value)).strftime("%Y-%m-%d %H:%M:%S UTC")
        else:
            display_value = value
        metadata_rows.append([key, display_value])
    sheets.append(
        {
            "name": "Sync Metadata",
            "headers": ["key", "value"],
            "rows": metadata_rows,
            "dateColumns": [],
        }
    )
    return {"sheets": sheets, "metadata": dataset.metadata}


def _prepare_workbook_runtime(config: BackupConfig) -> Path:
    runtime = backup_home() / "workbook-runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    modules_link = runtime / "node_modules"
    expected_modules = Path(config.artifact_node_modules).resolve()
    if modules_link.is_symlink() and modules_link.resolve() != expected_modules:
        modules_link.unlink()
    if not modules_link.exists():
        modules_link.symlink_to(expected_modules, target_is_directory=True)
    if not modules_link.is_dir():
        raise RuntimeError(f"Workbook runtime is invalid: {modules_link}")
    builder = runtime / "workbook_builder.mjs"
    shutil.copy2(config.root / "sync" / "workbook_builder.mjs", builder)
    return builder


def write_workbook_atomic(
    dataset: BackupDataset,
    config: BackupConfig,
    *,
    render_dir: Path | None = None,
) -> tuple[Path, Path]:
    config.exports_dir.mkdir(parents=True, exist_ok=True)
    config.archive_dir.mkdir(parents=True, exist_ok=True)
    builder = _prepare_workbook_runtime(config)
    with tempfile.TemporaryDirectory(prefix="concert-workbook-", dir=backup_home()) as temp_name:
        temp_dir = Path(temp_name)
        payload_path = temp_dir / "snapshot.json"
        workbook_path = temp_dir / "concerts.xlsx"
        atomic_write_text(payload_path, json.dumps(_workbook_payload(dataset), default=str))
        command = [config.node_path, str(builder), str(payload_path), str(workbook_path)]
        if render_dir:
            command.append(str(render_dir))
        result = subprocess.run(command, check=False, capture_output=True, text=True)
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "unknown workbook error"
            raise RuntimeError(f"Excel export failed: {message}")
        if not workbook_path.exists() or workbook_path.stat().st_size == 0:
            raise RuntimeError("Excel export did not produce a workbook")

        timestamp = datetime.fromisoformat(dataset.metadata["fetched_at"]).strftime(
            "%Y%m%dT%H%M%SZ"
        )
        archive_path = config.archive_dir / f"concerts-{timestamp}.xlsx"
        latest_path = config.exports_dir / "concerts-latest.xlsx"
        _atomic_copy(workbook_path, archive_path)
        _atomic_copy(workbook_path, latest_path)

    prune_archives(config.archive_dir)
    return latest_path, archive_path


def write_backup_artifacts(
    dataset: BackupDataset,
    config: BackupConfig,
    *,
    render_dir: Path | None = None,
) -> BackupArtifacts:
    sqlite_path = config.data_dir / "concert_tracker.sqlite3"
    write_sqlite_atomic(dataset, sqlite_path)
    workbook_path, archive_path = write_workbook_atomic(
        dataset,
        config,
        render_dir=render_dir,
    )
    return BackupArtifacts(
        sqlite_path=sqlite_path,
        workbook_path=workbook_path,
        archive_path=archive_path,
        counts=dataset.metadata["counts"],
        checksums=dataset.metadata["checksums"],
    )
