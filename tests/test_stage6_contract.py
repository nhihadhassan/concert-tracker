from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_soft_delete_rows_remain_visible_only_to_app_members() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260701110000_stage6_soft_delete_rls.sql"
    ).read_text()

    assert "concerts_select_deleted_shared" in migration
    assert "concert_attendees_select_deleted_shared" in migration
    assert "concert_reviews_select_deleted_shared" in migration
    assert migration.count("to authenticated") == 3
    assert migration.count("(select public.is_app_member())") == 3
    assert migration.count("deleted_at is not null") == 3
