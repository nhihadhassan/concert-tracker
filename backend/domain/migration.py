from __future__ import annotations

import base64
import hashlib
import json
import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid5

from backend.domain.analytics import AnalyticsConcert, calculate_analytics
from backend.domain.ratings import ReviewScores, calculate_rating, combine_final_ratings

MIGRATION_NAMESPACE = UUID("5bc26156-b646-5d74-bbe5-3a42152a0472")
RULE_VERSION_ONE_ID = str(uuid5(MIGRATION_NAMESPACE, "rating-rule:1"))
import os

# Deployment identities come from the environment; see README.
NHIHAD_EMAIL = os.getenv("PUBLIC_USER_EMAIL", "owner@example.com").lower()
RACHEL_EMAIL = os.getenv("PARTNER_USER_EMAIL", "partner@example.com").lower()


class MigrationValidationError(ValueError):
    """Raised when migration input cannot be reconciled without guessing."""


@dataclass(frozen=True)
class MigrationContext:
    nhihad_user_id: str
    rachel_user_id: str
    rating_rule_version_id: str = RULE_VERSION_ONE_ID
    historical_rank_by_identity: Mapping[str, int] = field(default_factory=dict)

    @property
    def users_by_email(self) -> Mapping[str, str]:
        return {
            NHIHAD_EMAIL: self.nhihad_user_id,
            RACHEL_EMAIL: self.rachel_user_id,
        }


@dataclass(frozen=True)
class ArtworkAsset:
    object_path: str
    content_type: str
    sha256: str
    size_bytes: int
    content: bytes = field(repr=False, compare=False)

    def manifest_row(self) -> dict[str, Any]:
        return {
            "object_path": self.object_path,
            "content_type": self.content_type,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
        }


@dataclass(frozen=True)
class MigrationState:
    concerts: tuple[dict[str, Any], ...] = ()
    concert_attendees: tuple[dict[str, Any], ...] = ()
    concert_reviews: tuple[dict[str, Any], ...] = ()
    artwork_assets: tuple[dict[str, Any], ...] = ()

    @classmethod
    def from_dict(cls, value: Mapping[str, Any] | None) -> MigrationState:
        value = value or {}
        return cls(
            concerts=tuple(value.get("concerts", [])),
            concert_attendees=tuple(value.get("concert_attendees", [])),
            concert_reviews=tuple(value.get("concert_reviews", [])),
            artwork_assets=tuple(value.get("artwork_assets", [])),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "concerts": list(self.concerts),
            "concert_attendees": list(self.concert_attendees),
            "concert_reviews": list(self.concert_reviews),
            "artwork_assets": list(self.artwork_assets),
        }


@dataclass(frozen=True)
class SourceRecord:
    source: str
    source_id: str
    identity: str
    record: Mapping[str, Any]
    updated_at: str | None = None


@dataclass(frozen=True)
class MigrationResult:
    state: MigrationState
    report: Mapping[str, Any]
    extracted_assets: tuple[ArtworkAsset, ...]


def normalized_identity(record: Mapping[str, Any]) -> str:
    artist = " ".join(str(record.get("artist") or "").strip().casefold().split())
    concert_date = str(record.get("date") or "").strip()
    return f"{artist}|{concert_date}"


def stable_uuid(kind: str, identity: str) -> str:
    return str(uuid5(MIGRATION_NAMESPACE, f"{kind}:{identity}"))


def canonical_checksum(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _optional_verbatim(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value)
    return result if result.strip() else None


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(Decimal(str(value)))


def _source_id(record: Mapping[str, Any], fallback: Any) -> str:
    value = record.get("id") or fallback
    if value is None or not str(value).strip():
        return stable_uuid("legacy-source", normalized_identity(record))
    return str(value).strip()


def _changed_fields(left: Mapping[str, Any], right: Mapping[str, Any]) -> list[str]:
    ignored = {"cloudUpdatedAt", "id", "timestamp"}
    return sorted(
        key
        for key in set(left) | set(right)
        if key not in ignored and left.get(key) != right.get(key)
    )


def reconcile_sources(
    cloud_rows: Iterable[Mapping[str, Any]],
    browser_records: Iterable[Mapping[str, Any]],
) -> tuple[list[SourceRecord], list[dict[str, Any]], dict[str, int]]:
    canonical: list[SourceRecord] = []
    events: list[dict[str, Any]] = []
    cloud_by_id: dict[str, SourceRecord] = {}
    cloud_by_identity: dict[str, SourceRecord] = {}
    cloud_invalid = 0

    for index, wrapper in enumerate(cloud_rows):
        record = wrapper.get("data") if isinstance(wrapper.get("data"), Mapping) else wrapper
        source_id = _source_id(record, wrapper.get("id"))
        identity = normalized_identity(record)
        missing = [
            field for field in ("artist", "date", "venue") if not _optional_text(record.get(field))
        ]
        if missing or identity.endswith("|") or identity.startswith("|"):
            cloud_invalid += 1
            events.append(
                {
                    "action": "invalid",
                    "source": "cloud",
                    "source_id": source_id,
                    "identity": identity,
                    "reason": f"missing required fields: {', '.join(missing)}",
                }
            )
            continue
        if source_id in cloud_by_id or identity in cloud_by_identity:
            cloud_invalid += 1
            events.append(
                {
                    "action": "invalid",
                    "source": "cloud",
                    "source_id": source_id,
                    "identity": identity,
                    "reason": "duplicate cloud source ID or normalized artist/date",
                }
            )
            continue
        source = SourceRecord(
            source="cloud",
            source_id=source_id,
            identity=identity,
            record=record,
            updated_at=_optional_text(wrapper.get("updated_at")),
        )
        canonical.append(source)
        cloud_by_id[source_id] = source
        cloud_by_identity[identity] = source
        events.append(
            {
                "action": "converted",
                "source": "cloud",
                "source_id": source_id,
                "identity": identity,
                "source_index": index,
            }
        )

    browser_imported = 0
    browser_skipped = 0
    browser_invalid = 0
    source_ids = set(cloud_by_id)
    identities = set(cloud_by_identity)
    for index, record in enumerate(browser_records):
        source_id = _source_id(record, None)
        identity = normalized_identity(record)
        match = cloud_by_id.get(source_id) or cloud_by_identity.get(identity)
        if match:
            browser_skipped += 1
            events.append(
                {
                    "action": "skipped",
                    "source": "browser",
                    "source_id": source_id,
                    "identity": identity,
                    "reason": "cloud record retained",
                    "matched_by": "id" if source_id in cloud_by_id else "normalized artist/date",
                    "changed_fields": _changed_fields(record, match.record),
                    "source_index": index,
                }
            )
            continue
        missing = [
            field for field in ("artist", "date", "venue") if not _optional_text(record.get(field))
        ]
        if missing or source_id in source_ids or identity in identities:
            browser_invalid += 1
            events.append(
                {
                    "action": "invalid",
                    "source": "browser",
                    "source_id": source_id,
                    "identity": identity,
                    "reason": f"missing required fields: {', '.join(missing)}"
                    if missing
                    else "duplicate browser source ID or normalized artist/date",
                    "source_index": index,
                }
            )
            continue
        canonical.append(
            SourceRecord(
                source="browser",
                source_id=source_id,
                identity=identity,
                record=record,
            )
        )
        source_ids.add(source_id)
        identities.add(identity)
        browser_imported += 1
        events.append(
            {
                "action": "converted",
                "source": "browser",
                "source_id": source_id,
                "identity": identity,
                "reason": "browser-only record",
                "source_index": index,
            }
        )

    counts = {
        "cloud_input": len(cloud_by_id) + cloud_invalid,
        "cloud_converted": len(cloud_by_id),
        "browser_input": browser_imported + browser_skipped + browser_invalid,
        "browser_imported": browser_imported,
        "browser_skipped": browser_skipped,
        "cloud_invalid": cloud_invalid,
        "browser_invalid": browser_invalid,
        "invalid": cloud_invalid + browser_invalid,
        "canonical": len(canonical),
    }
    return canonical, events, counts


def _status(value: Any) -> str:
    status = _optional_text(value) or "Want to Go"
    if status not in {"Want to Go", "Attended", "Cancelled"}:
        raise MigrationValidationError(f"unsupported concert status: {status}")
    return status


def _attendance_status(concert_status: str) -> str:
    return {
        "Attended": "Attended",
        "Want to Go": "Planned",
        "Cancelled": "Did Not Attend",
    }[concert_status]


def _decode_artwork(value: str, identity: str) -> tuple[str, ArtworkAsset] | None:
    match = re.fullmatch(r"data:(image/[a-zA-Z0-9.+-]+);base64,(.+)", value, flags=re.DOTALL)
    if not match:
        return None
    try:
        content = base64.b64decode(match.group(2), validate=True)
    except ValueError as exc:
        raise MigrationValidationError(f"invalid base64 artwork for {identity}") from exc
    content_type = match.group(1).lower()
    extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(content_type)
    if extension is None:
        raise MigrationValidationError(f"unsupported artwork type {content_type} for {identity}")
    digest = hashlib.sha256(content).hexdigest()
    object_path = f"concert-artwork/{digest}.{extension}"
    return (
        f"storage://{object_path}",
        ArtworkAsset(
            object_path=object_path,
            content_type=content_type,
            sha256=digest,
            size_bytes=len(content),
            content=content,
        ),
    )


def _metadata(source: SourceRecord, actor_id: str) -> dict[str, Any]:
    created_at = (
        _optional_text(source.record.get("timestamp"))
        or source.updated_at
        or "1970-01-01T00:00:00Z"
    )
    return {
        "created_at": created_at,
        "updated_at": source.updated_at or created_at,
        "created_by": actor_id,
        "updated_by": actor_id,
        "deleted_at": None,
        "row_version": 1,
    }


def _review_row(
    source: SourceRecord,
    concert_id: str,
    reviewer_user_id: str,
    context: MigrationContext,
    *,
    rachel: bool,
) -> tuple[dict[str, Any] | None, bool]:
    record = source.record
    if rachel:
        legacy_rating = _number(record.get("rachelScore"))
        if legacy_rating is None:
            return None, False
        scores = ReviewScores()
        result = calculate_rating(
            scores,
            override_rating=legacy_rating,
            override_reason="Imported legacy Rachel score",
        )
        legacy_source = "concert_tracker_concerts:rachelScore"
    else:
        values = {
            "enjoyment": _number(record.get("enjoyment")),
            "stage": _number(record.get("stage")),
            "setlist": _number(record.get("setlist")),
            "seat": _number(record.get("seatScore")),
        }
        legacy_rating = _number(record.get("realized"))
        if legacy_rating is None and all(value is None for value in values.values()):
            return None, False
        scores = ReviewScores(**values)
        calculated = calculate_rating(scores)
        needs_override = legacy_rating is not None and calculated.calculated_rating != Decimal(
            str(legacy_rating)
        )
        result = calculate_rating(
            scores,
            override_rating=legacy_rating if needs_override else None,
            override_reason="Imported legacy realized rating" if needs_override else None,
        )
        legacy_source = "concert_tracker_concerts:realized"

    actor_id = context.nhihad_user_id
    return (
        {
            "id": stable_uuid("review", f"{concert_id}:{reviewer_user_id}"),
            "concert_id": concert_id,
            "reviewer_user_id": reviewer_user_id,
            "rating_rule_version_id": context.rating_rule_version_id,
            "enjoyment_score": _number(scores.enjoyment),
            "stage_score": _number(scores.stage),
            "setlist_score": _number(scores.setlist),
            "seat_score": _number(scores.seat),
            "rating_override": float(result.override_rating)
            if result.override_rating is not None
            else None,
            "rating_override_reason": result.override_reason,
            "review_notes": None,
            "legacy_source": legacy_source,
            **_metadata(source, actor_id),
        },
        result.is_overridden,
    )


def _row_key(table: str) -> Callable[[Mapping[str, Any]], str]:
    if table == "concert_attendees":
        return lambda row: f"{row['concert_id']}:{row['user_id']}"
    if table == "artwork_assets":
        return lambda row: str(row["object_path"])
    return lambda row: str(row["id"])


def _merge_rows(
    table: str,
    existing: Iterable[Mapping[str, Any]],
    desired: Iterable[Mapping[str, Any]],
) -> tuple[tuple[dict[str, Any], ...], dict[str, int]]:
    key_for = _row_key(table)
    rows = [dict(row) for row in existing]
    positions = {key_for(row): index for index, row in enumerate(rows)}
    inserted = updated = unchanged = 0
    for desired_row in desired:
        row = dict(desired_row)
        key = key_for(row)
        position = positions.get(key)
        if position is None:
            positions[key] = len(rows)
            rows.append(row)
            inserted += 1
        elif rows[position] == row:
            unchanged += 1
        else:
            rows[position] = row
            updated += 1
    return tuple(rows), {"inserted": inserted, "updated": updated, "unchanged": unchanged}


def _analytics_verification(state: MigrationState, context: MigrationContext) -> dict[str, Any]:
    reviews_by_concert: dict[str, list[Mapping[str, Any]]] = {}
    for review in state.concert_reviews:
        reviews_by_concert.setdefault(str(review["concert_id"]), []).append(review)

    rows: list[AnalyticsConcert] = []
    for concert in state.concerts:
        member_ratings: dict[str, Decimal | None] = {}
        for review in reviews_by_concert.get(str(concert["id"]), []):
            result = calculate_rating(
                ReviewScores(
                    review.get("enjoyment_score"),
                    review.get("stage_score"),
                    review.get("setlist_score"),
                    review.get("seat_score"),
                ),
                override_rating=review.get("rating_override"),
                override_reason=review.get("rating_override_reason"),
            )
            member_ratings[str(review["reviewer_user_id"])] = result.final_rating
        combined = combine_final_ratings(list(member_ratings.values()))
        rows.append(
            AnalyticsConcert(
                concert_id=str(concert["id"]),
                artist=str(concert["artist"]),
                concert_date=date.fromisoformat(str(concert["concert_date"])),
                venue=str(concert["venue"]),
                status=str(concert["status"]),
                price=Decimal(str(concert["price"])) if concert.get("price") is not None else None,
                genre=_optional_text(concert.get("genre")),
                projected_rating=Decimal(str(concert["projected_rating"]))
                if concert.get("projected_rating") is not None
                else None,
                member_ratings=member_ratings,
                combined_rating=combined,
                ranking_tiebreaker=concert.get("legacy_rank"),
            )
        )

    analytics = calculate_analytics(rows)
    rankings = {
        scope: [
            {
                "rank": row.rank,
                "concert_id": row.concert_id,
                "artist": row.artist,
                "date": row.concert_date.isoformat(),
                "rating": float(row.rating),
            }
            for row in ranking
        ]
        for scope, ranking in analytics.rankings.items()
    }
    nhihad_summary = next(
        (row for row in analytics.rating_summaries if row.scope == context.nhihad_user_id), None
    )
    return {
        "total_concerts": analytics.total_concerts,
        "status_counts": dict(analytics.status_counts),
        "total_spent_excluding_cancelled": float(
            analytics.spending.total_spent_excluding_cancelled
        ),
        "nhihad_rated_concerts": nhihad_summary.rated_concerts if nhihad_summary else 0,
        "nhihad_average_rating": float(nhihad_summary.average_rating)
        if nhihad_summary and nhihad_summary.average_rating is not None
        else None,
        "rankings": rankings,
    }


def migrate_legacy_records(
    cloud_rows: Iterable[Mapping[str, Any]],
    browser_records: Iterable[Mapping[str, Any]],
    context: MigrationContext,
    *,
    existing: MigrationState | None = None,
) -> MigrationResult:
    canonical, events, source_counts = reconcile_sources(cloud_rows, browser_records)
    desired_concerts: list[dict[str, Any]] = []
    desired_attendees: list[dict[str, Any]] = []
    desired_reviews: list[dict[str, Any]] = []
    assets_by_path: dict[str, ArtworkAsset] = {}
    remote_artwork = empty_artwork = nhihad_overrides = rachel_overrides = 0

    for source in canonical:
        record = source.record
        owner_email = (_optional_text(record.get("ownerEmail")) or NHIHAD_EMAIL).casefold()
        owner_id = context.users_by_email.get(owner_email)
        if owner_id is None:
            raise MigrationValidationError(
                f"unknown ownerEmail {owner_email!r} for {source.identity}"
            )
        concert_id = stable_uuid("concert", source.source_id)
        concert_status = _status(record.get("status"))
        image = _optional_text(record.get("image"))
        image_url = image
        if image and image.startswith("data:"):
            decoded = _decode_artwork(image, source.identity)
            if decoded is None:
                raise MigrationValidationError(f"invalid artwork data URL for {source.identity}")
            image_url, asset = decoded
            assets_by_path[asset.object_path] = asset
        elif image:
            remote_artwork += 1
        else:
            empty_artwork += 1

        desired_concerts.append(
            {
                "id": concert_id,
                "artist": _optional_text(record.get("artist")),
                "tour_name": _optional_text(record.get("tour")),
                "concert_date": _optional_text(record.get("date")),
                "venue": _optional_text(record.get("venue")),
                "price": _number(record.get("price")),
                "genre": _optional_text(record.get("genre")),
                "projected_rating": _number(record.get("projScore")),
                "seat": _optional_text(record.get("seat")),
                "status": concert_status,
                "concert_type": _optional_text(record.get("type")) or "Concert",
                "spotify_url": _optional_text(record.get("spotify")),
                "image_url": image_url,
                "notes": _optional_verbatim(record.get("notes")),
                "companions": _optional_verbatim(record.get("companions")),
                "legacy_rank": context.historical_rank_by_identity.get(source.identity),
                "legacy_source_id": source.source_id,
                **_metadata(source, owner_id),
            }
        )

        desired_attendees.append(
            {
                "concert_id": concert_id,
                "user_id": owner_id,
                "attendance_status": _attendance_status(concert_status),
                "legacy_source": "concert_tracker_concerts:ownerEmail",
                **_metadata(source, owner_id),
            }
        )
        if bool(record.get("rachelAttended")):
            desired_attendees.append(
                {
                    "concert_id": concert_id,
                    "user_id": context.rachel_user_id,
                    "attendance_status": _attendance_status(concert_status),
                    "legacy_source": "concert_tracker_concerts:rachelAttended",
                    **_metadata(source, owner_id),
                }
            )

        nhihad_review, overridden = _review_row(
            source,
            concert_id,
            context.nhihad_user_id,
            context,
            rachel=False,
        )
        if nhihad_review:
            desired_reviews.append(nhihad_review)
            nhihad_overrides += int(overridden)
        rachel_review, overridden = _review_row(
            source,
            concert_id,
            context.rachel_user_id,
            context,
            rachel=True,
        )
        if rachel_review:
            desired_reviews.append(rachel_review)
            rachel_overrides += int(overridden)

    existing = existing or MigrationState()
    concerts, concert_ops = _merge_rows("concerts", existing.concerts, desired_concerts)
    attendees, attendee_ops = _merge_rows(
        "concert_attendees", existing.concert_attendees, desired_attendees
    )
    reviews, review_ops = _merge_rows("concert_reviews", existing.concert_reviews, desired_reviews)
    asset_rows = [asset.manifest_row() for asset in assets_by_path.values()]
    artwork_assets, artwork_ops = _merge_rows("artwork_assets", existing.artwork_assets, asset_rows)
    state = MigrationState(concerts, attendees, reviews, artwork_assets)
    report = {
        "source": source_counts,
        "destination": {
            "counts": {
                "concerts": len(state.concerts),
                "concert_attendees": len(state.concert_attendees),
                "concert_reviews": len(state.concert_reviews),
                "artwork_assets": len(state.artwork_assets),
            },
            "operations": {
                "concerts": concert_ops,
                "concert_attendees": attendee_ops,
                "concert_reviews": review_ops,
                "artwork_assets": artwork_ops,
            },
            "checksum": canonical_checksum(state.to_dict()),
        },
        "reviews": {
            "nhihad": sum(
                row["reviewer_user_id"] == context.nhihad_user_id for row in desired_reviews
            ),
            "rachel": sum(
                row["reviewer_user_id"] == context.rachel_user_id for row in desired_reviews
            ),
            "nhihad_overrides": nhihad_overrides,
            "rachel_overrides": rachel_overrides,
        },
        "artwork": {
            "remote_urls": remote_artwork,
            "base64_extracted": len(assets_by_path),
            "empty": empty_artwork,
        },
        "events": events,
        "verification": _analytics_verification(state, context),
    }
    return MigrationResult(
        state=state,
        report=report,
        extracted_assets=tuple(assets_by_path.values()),
    )


def context_from_auth_users(
    users: Iterable[Mapping[str, Any]],
    *,
    rating_rule_version_id: str = RULE_VERSION_ONE_ID,
    historical_rankings: Iterable[Mapping[str, Any]] = (),
) -> MigrationContext:
    by_email = {
        str(user.get("email") or "").strip().casefold(): str(user.get("id") or "").strip()
        for user in users
    }
    missing = [email for email in (NHIHAD_EMAIL, RACHEL_EMAIL) if not by_email.get(email)]
    if missing:
        raise MigrationValidationError(f"missing Auth users: {', '.join(missing)}")
    return MigrationContext(
        nhihad_user_id=by_email[NHIHAD_EMAIL],
        rachel_user_id=by_email[RACHEL_EMAIL],
        rating_rule_version_id=rating_rule_version_id,
        historical_rank_by_identity={
            normalized_identity({"artist": row.get("artist"), "date": row.get("date")}): int(
                row["rank"]
            )
            for row in historical_rankings
        },
    )


def context_dict(context: MigrationContext) -> dict[str, Any]:
    return asdict(context)
