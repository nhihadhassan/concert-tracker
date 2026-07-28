from pathlib import Path

MIGRATION = Path("supabase/migrations/20260630180000_stage2_shared_schema.sql")
STAGE_FOUR_MIGRATION = Path("supabase/migrations/20260630190000_stage4_companion_preservation.sql")
STAGE_FIVE_MIGRATION = Path("supabase/migrations/20260701010000_stage5_functional_cloud.sql")
ALBUM_JOURNAL_MIGRATION = Path("supabase/migrations/20260727113000_album_journal.sql")
TABLES = (
    "app_members",
    "concerts",
    "concert_attendees",
    "concert_reviews",
    "rating_rule_versions",
)
ALBUM_TABLES = ("albums", "album_tracks", "album_reviews", "album_track_reviews")


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


def test_stage_five_adds_idempotency_and_realtime_without_legacy_changes() -> None:
    sql = STAGE_FIVE_MIGRATION.read_text()

    assert sql.count("add column if not exists last_mutation_id uuid") == 3
    assert "create table if not exists public.api_idempotency_keys" in sql
    assert "user_id = (select auth.uid())" in sql
    assert "alter table public.api_idempotency_keys enable row level security" in sql
    assert "alter publication supabase_realtime add table" in sql
    assert "concert_tracker_concerts" not in sql
    assert "exp_" not in sql


def test_album_journal_tables_are_private_realtime_resources() -> None:
    sql = ALBUM_JOURNAL_MIGRATION.read_text()

    for table in ALBUM_TABLES:
        assert f"alter table public.{table} enable row level security;" in sql
        assert f"revoke all on public.{table} from anon, authenticated;" in sql
        assert f"alter publication supabase_realtime add table public.{table};" in sql
    assert "grant delete" not in sql.lower()
    assert "for delete" not in sql.lower()


def test_album_reviews_are_owner_written_and_identity_protected() -> None:
    sql = ALBUM_JOURNAL_MIGRATION.read_text()

    assert sql.count("reviewer_user_id = (select auth.uid())") >= 6
    assert "status = 'published' or reviewer_user_id = (select auth.uid())" in sql
    assert "public.album_reviews.status = 'published'" in sql
    assert "protect_album_review_identity" in sql
    assert "protect_album_track_review_identity" in sql
    assert "public.album_reviews.reviewer_user_id = (select auth.uid())" in sql
    assert "public.album_tracks.album_id = public.album_reviews.album_id" in sql
