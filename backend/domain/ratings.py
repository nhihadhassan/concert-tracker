from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Union

Numeric = Union[Decimal, int, float, str]
COMPONENT_NAMES = ("enjoyment", "stage", "setlist", "seat", "performance")


class RatingValidationError(ValueError):
    """Raised when rating inputs violate the documented domain rules."""


def as_decimal(value: Numeric | None, *, field: str) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise RatingValidationError(f"{field} must be numeric")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise RatingValidationError(f"{field} must be numeric") from exc
    if not result.is_finite():
        raise RatingValidationError(f"{field} must be finite")
    return result


def round_decimal(value: Decimal, places: int) -> Decimal:
    quantum = Decimal("1").scaleb(-places)
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class RatingRule:
    version: int = 2
    enjoyment_weight: Decimal = Decimal("0.6")
    stage_weight: Decimal = Decimal("0.1")
    setlist_weight: Decimal = Decimal("0.1")
    seat_weight: Decimal = Decimal("0.1")
    performance_weight: Decimal = Decimal("0.1")
    rounds_to: int = 1
    maximum_rating: Decimal = Decimal("10")
    renormalize_missing: bool = True

    def __post_init__(self) -> None:
        if self.version < 1:
            raise RatingValidationError("rule version must be positive")
        if self.rounds_to < 0 or self.rounds_to > 4:
            raise RatingValidationError("rounds_to must be between 0 and 4")
        if self.maximum_rating <= 0:
            raise RatingValidationError("maximum_rating must be positive")
        if any(weight <= 0 for weight in self.weights.values()):
            raise RatingValidationError("rating weights must be positive")

    @property
    def weights(self) -> Mapping[str, Decimal]:
        return {
            "enjoyment": self.enjoyment_weight,
            "stage": self.stage_weight,
            "setlist": self.setlist_weight,
            "seat": self.seat_weight,
            "performance": self.performance_weight,
        }

    @property
    def normalized_weights(self) -> Mapping[str, Decimal]:
        total = sum(self.weights.values(), Decimal("0"))
        return {name: weight / total for name, weight in self.weights.items()}


DEFAULT_RATING_RULE = RatingRule()


@dataclass(frozen=True)
class ReviewScores:
    enjoyment: Numeric | None = None
    stage: Numeric | None = None
    setlist: Numeric | None = None
    seat: Numeric | None = None
    performance: Numeric | None = None

    def validated(self) -> Mapping[str, Decimal | None]:
        scores = {
            name: as_decimal(getattr(self, name), field=f"{name}_score") for name in COMPONENT_NAMES
        }
        for name, score in scores.items():
            if score is not None and score < 0:
                raise RatingValidationError(f"{name}_score cannot be negative")
        return scores


@dataclass(frozen=True)
class RatingResult:
    rule_version: int
    uncapped_rating: Decimal | None
    calculated_rating: Decimal | None
    override_rating: Decimal | None
    final_rating: Decimal | None
    override_reason: str | None
    present_components: tuple[str, ...]
    missing_components: tuple[str, ...]

    @property
    def is_overridden(self) -> bool:
        return self.override_rating is not None


def calculate_rating(
    scores: ReviewScores,
    *,
    override_rating: Numeric | None = None,
    override_reason: str | None = None,
    rule: RatingRule = DEFAULT_RATING_RULE,
) -> RatingResult:
    validated = scores.validated()
    present = tuple(name for name in COMPONENT_NAMES if validated[name] is not None)
    missing = tuple(name for name in COMPONENT_NAMES if validated[name] is None)

    uncapped: Decimal | None = None
    calculated: Decimal | None = None
    if present:
        numerator = sum((validated[name] or Decimal("0")) * rule.weights[name] for name in present)
        denominator = (
            sum((rule.weights[name] for name in present), Decimal("0"))
            if rule.renormalize_missing
            else sum(rule.weights.values(), Decimal("0"))
        )
        raw_rating = numerator / denominator
        uncapped = round_decimal(raw_rating, rule.rounds_to)
        calculated = round_decimal(min(raw_rating, rule.maximum_rating), rule.rounds_to)

    override = as_decimal(override_rating, field="override_rating")
    reason = override_reason.strip() if override_reason else None
    if override is not None:
        if override < 0 or override > rule.maximum_rating:
            raise RatingValidationError(
                f"override_rating must be between 0 and {rule.maximum_rating}"
            )
        if not reason:
            raise RatingValidationError("override_reason is required when override_rating is set")
        override = round_decimal(override, rule.rounds_to)
    elif reason:
        raise RatingValidationError("override_rating is required when override_reason is set")

    return RatingResult(
        rule_version=rule.version,
        uncapped_rating=uncapped,
        calculated_rating=calculated,
        override_rating=override,
        final_rating=override if override is not None else calculated,
        override_reason=reason,
        present_components=present,
        missing_components=missing,
    )


def combine_final_ratings(
    ratings: list[Decimal | None],
    *,
    rule: RatingRule = DEFAULT_RATING_RULE,
) -> Decimal | None:
    available = [rating for rating in ratings if rating is not None]
    if not available:
        return None
    mean = sum(available, Decimal("0")) / Decimal(len(available))
    return round_decimal(min(mean, rule.maximum_rating), rule.rounds_to)
