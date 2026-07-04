from decimal import Decimal

import pytest

from backend.domain.ratings import (
    RatingRule,
    RatingValidationError,
    ReviewScores,
    calculate_rating,
    combine_final_ratings,
)


@pytest.mark.parametrize(
    ("scores", "expected"),
    [
        (ReviewScores(8, 7, 8, 9), Decimal("8.0")),
        (ReviewScores(10, None, 8, 6), Decimal("8.8")),
        (ReviewScores(None, 7, 8, 9), Decimal("8.0")),
    ],
)
def test_weighted_rating_golden_cases(scores: ReviewScores, expected: Decimal) -> None:
    result = calculate_rating(scores)

    assert result.calculated_rating == expected
    assert result.final_rating == expected


def test_exceptional_components_are_preserved_but_calculation_is_capped() -> None:
    result = calculate_rating(ReviewScores(11, 12, 10, 9))

    assert result.uncapped_rating == Decimal("10.7")
    assert result.calculated_rating == Decimal("10.0")
    assert result.final_rating == Decimal("10.0")


def test_override_is_explicit_and_wins_over_calculation() -> None:
    result = calculate_rating(
        ReviewScores(8, 7, 8, 9),
        override_rating=9.6,
        override_reason="Legacy realized rating",
    )

    assert result.calculated_rating == Decimal("8.0")
    assert result.override_rating == Decimal("9.6")
    assert result.final_rating == Decimal("9.6")
    assert result.is_overridden is True


def test_override_requires_a_reason() -> None:
    with pytest.raises(RatingValidationError, match="override_reason is required"):
        calculate_rating(ReviewScores(8, 8, 8, 8), override_rating=9)


def test_reason_requires_an_override() -> None:
    with pytest.raises(RatingValidationError, match="override_rating is required"):
        calculate_rating(ReviewScores(8, 8, 8, 8), override_reason="No score")


def test_empty_review_can_still_hold_a_documented_legacy_override() -> None:
    empty = calculate_rating(ReviewScores())
    overridden = calculate_rating(
        ReviewScores(),
        override_rating=8.4,
        override_reason="Imported legacy score",
    )

    assert empty.calculated_rating is None
    assert empty.final_rating is None
    assert overridden.calculated_rating is None
    assert overridden.final_rating == Decimal("8.4")


def test_combined_rating_ignores_missing_reviews_and_rounds_half_up() -> None:
    combined = combine_final_ratings([Decimal("8.2"), None, Decimal("8.3")])

    assert combined == Decimal("8.3")


def test_rule_versions_can_change_weights_without_changing_engine_code() -> None:
    rule = RatingRule(
        version=2,
        enjoyment_weight=Decimal("1"),
        stage_weight=Decimal("1"),
        setlist_weight=Decimal("1"),
        seat_weight=Decimal("1"),
    )

    result = calculate_rating(ReviewScores(10, 0, 0, 0), rule=rule)

    assert result.rule_version == 2
    assert result.calculated_rating == Decimal("2.5")


def test_negative_and_non_finite_components_are_rejected() -> None:
    with pytest.raises(RatingValidationError, match="cannot be negative"):
        calculate_rating(ReviewScores(enjoyment=-1))
    with pytest.raises(RatingValidationError, match="must be finite"):
        calculate_rating(ReviewScores(enjoyment="NaN"))
