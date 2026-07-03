-- Replace open anon access with owner-only access (email magic-link auth).
drop policy if exists "ct anon select" on public.concert_tracker_concerts;
drop policy if exists "ct anon insert" on public.concert_tracker_concerts;
drop policy if exists "ct anon update" on public.concert_tracker_concerts;
drop policy if exists "ct anon delete" on public.concert_tracker_concerts;

-- Only an authenticated user whose verified email matches the owner may read/write.
create policy "ct owner all" on public.concert_tracker_concerts
  for all to authenticated
  using (lower(auth.jwt() ->> 'email') = 'owner@example.com')
  with check (lower(auth.jwt() ->> 'email') = 'owner@example.com');;
