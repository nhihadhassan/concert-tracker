begin;

-- PostgreSQL UPDATE checks SELECT visibility for the resulting row. These
-- member-only policies let the API complete a soft delete while every app
-- query continues to request deleted_at=is.null.
drop policy if exists concerts_select_deleted_shared on public.concerts;
create policy concerts_select_deleted_shared
on public.concerts for select
to authenticated
using ((select public.is_app_member()) and deleted_at is not null);

drop policy if exists concert_attendees_select_deleted_shared on public.concert_attendees;
create policy concert_attendees_select_deleted_shared
on public.concert_attendees for select
to authenticated
using ((select public.is_app_member()) and deleted_at is not null);

drop policy if exists concert_reviews_select_deleted_shared on public.concert_reviews;
create policy concert_reviews_select_deleted_shared
on public.concert_reviews for select
to authenticated
using ((select public.is_app_member()) and deleted_at is not null);

commit;
