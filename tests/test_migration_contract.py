from pathlib import Path

MIGRATION = Path("supabase/migrations/20260630180000_stage2_shared_schema.sql")
STAGE_FOUR_MIGRATION = Path("supabase/migrations/20260630190000_stage4_companion_preservation.sql")
TABLES = (
    "app_members",
    "concerts",
    "concert_attendees",
    "concert_reviews",
    "rating_rule_versions",
)


def test_every_stage_two_table_enables_rls() -> None:
    sql = MIGRATION.read_text()

    for table in TABLES:
        assert f"alter table public.{table} enable row level security;" in sql
        assert f"revoke all on public.{table} from anon, authenticated;" in sql


def test_shared_tables_do_not_grant_physical_delete() -> None:
    sql = MIGRATION.read_text().lower()

    assert "grant delete" not in sql
    assert "for delete" not in sql


def test_member_and_review_ownership_are_explicit() -> None:
    sql = MIGRATION.read_text()

    assert "to authenticated" in sql
    assert "reviewer_user_id = (select auth.uid())" in sql
    assert "created_by = (select auth.uid())" in sql
    assert "protect_attendee_identity" in sql
    assert "protect_review_identity" in sql


def test_rating_rule_matches_product_contract() -> None:
    sql = MIGRATION.read_text()

    assert "0.5000000" in sql
    assert sql.count("0.1666667") == 2
    assert "0.1666666" in sql
    assert "maximum_rating" in sql
    assert "renormalize_missing" in sql


def test_stage_four_preserves_companions_and_legacy_idempotency_key() -> None:
    sql = STAGE_FOUR_MIGRATION.read_text()

    assert "add column if not exists companions text" in sql
    assert "add column if not exists legacy_rank integer" in sql
    assert "create unique index if not exists concerts_legacy_source_id_uidx" in sql
    assert "create unique index if not exists concerts_legacy_rank_uidx" in sql
    assert "where legacy_source_id is not null" in sql
