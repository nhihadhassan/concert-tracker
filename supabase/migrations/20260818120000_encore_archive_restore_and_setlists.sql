-- Encore archive improvements: actual setlists and an all-or-nothing restore RPC.

alter table public.concerts
  add column if not exists setlist_url text;

create or replace function public.restore_encore_backup(
  payload jsonb,
  actor_id uuid,
  mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  target_id uuid;
  record_id uuid;
  attendee jsonb;
  review jsonb;
  restored_count integer := 0;
begin
  for item in select value from jsonb_array_elements(coalesce(payload->'records', '[]'::jsonb))
  loop
    target_id := nullif(item->>'target_id', '')::uuid;
    record_id := coalesce(target_id, (item->'concert'->>'id')::uuid);

    if target_id is null then
      insert into public.concerts (
        id, artist, tour_name, concert_date, venue, price, genre,
        projected_rating, seat, status, concert_type, setlist_url, spotify_url,
        image_url, notes, companions, created_by, last_mutation_id
      ) values (
        record_id,
        item->'concert'->>'artist',
        nullif(item->'concert'->>'tour', ''),
        (item->'concert'->>'date')::date,
        item->'concert'->>'venue',
        nullif(item->'concert'->>'price', '')::numeric,
        nullif(item->'concert'->>'genre', ''),
        nullif(item->'concert'->>'projected', '')::numeric,
        nullif(item->'concert'->>'seat', ''),
        item->'concert'->>'status',
        coalesce(nullif(item->'concert'->>'type', ''), 'Concert'),
        nullif(item->'concert'->>'setlist_url', ''),
        nullif(item->'concert'->>'spotify_url', ''),
        nullif(item->'concert'->>'image', ''),
        nullif(item->'concert'->>'notes', ''),
        nullif(item->'concert'->>'companions', ''),
        actor_id,
        mutation_id
      );
    else
      update public.concerts
      set artist = item->'concert'->>'artist',
          tour_name = nullif(item->'concert'->>'tour', ''),
          concert_date = (item->'concert'->>'date')::date,
          venue = item->'concert'->>'venue',
          price = nullif(item->'concert'->>'price', '')::numeric,
          genre = nullif(item->'concert'->>'genre', ''),
          projected_rating = nullif(item->'concert'->>'projected', '')::numeric,
          seat = nullif(item->'concert'->>'seat', ''),
          status = item->'concert'->>'status',
          concert_type = coalesce(nullif(item->'concert'->>'type', ''), 'Concert'),
          setlist_url = nullif(item->'concert'->>'setlist_url', ''),
          spotify_url = nullif(item->'concert'->>'spotify_url', ''),
          image_url = nullif(item->'concert'->>'image', ''),
          notes = nullif(item->'concert'->>'notes', ''),
          companions = nullif(item->'concert'->>'companions', ''),
          last_mutation_id = mutation_id
      where id = target_id and deleted_at is null;
      if not found then
        raise exception 'Restore target % no longer exists', target_id;
      end if;
    end if;

    for attendee in select value from jsonb_array_elements(coalesce(item->'attendees', '[]'::jsonb))
    loop
      insert into public.concert_attendees (
        concert_id, user_id, attendance_status, created_by, last_mutation_id, deleted_at
      ) values (
        record_id,
        (attendee->>'user_id')::uuid,
        attendee->>'attendance_status',
        actor_id,
        mutation_id,
        null
      ) on conflict (concert_id, user_id) do update
      set attendance_status = excluded.attendance_status,
          deleted_at = null,
          last_mutation_id = mutation_id;
    end loop;

    for review in select value from jsonb_array_elements(coalesce(item->'reviews', '[]'::jsonb))
    loop
      insert into public.concert_reviews (
        id, concert_id, reviewer_user_id, enjoyment_score, stage_score,
        setlist_score, seat_score, rating_override, rating_override_reason,
        review_notes, rating_rule_version_id, created_by, last_mutation_id, deleted_at
      ) values (
        coalesce(nullif(review->>'id', '')::uuid, extensions.gen_random_uuid()),
        record_id,
        (review->>'reviewer_user_id')::uuid,
        nullif(review->>'enjoyment_score', '')::numeric,
        nullif(review->>'stage_score', '')::numeric,
        nullif(review->>'setlist_score', '')::numeric,
        nullif(review->>'seat_score', '')::numeric,
        nullif(review->>'override_rating', '')::numeric,
        nullif(review->>'override_reason', ''),
        nullif(review->>'notes', ''),
        (select id from public.rating_rule_versions where retired_at is null order by version desc limit 1),
        actor_id,
        mutation_id,
        null
      ) on conflict (concert_id, reviewer_user_id) do update
      set enjoyment_score = excluded.enjoyment_score,
          stage_score = excluded.stage_score,
          setlist_score = excluded.setlist_score,
          seat_score = excluded.seat_score,
          rating_override = excluded.rating_override,
          rating_override_reason = excluded.rating_override_reason,
          review_notes = excluded.review_notes,
          rating_rule_version_id = excluded.rating_rule_version_id,
          deleted_at = null,
          last_mutation_id = mutation_id;
    end loop;
    restored_count := restored_count + 1;
  end loop;
  return jsonb_build_object('restored', restored_count);
end;
$$;

revoke all on function public.restore_encore_backup(jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_encore_backup(jsonb, uuid, uuid) to service_role;
