-- Run this once in Supabase: SQL Editor > New query > Run.
-- Each signed-in user can read and change only their own row and photo folder.

create table if not exists public.shipping_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.shipping_app_state enable row level security;
grant select, insert, update, delete on public.shipping_app_state to authenticated;

drop policy if exists "Users manage their own shipping state" on public.shipping_app_state;
create policy "Users manage their own shipping state"
on public.shipping_app_state
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('shipping-photos', 'shipping-photos', false)
on conflict (id) do update set public = false;

grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "Users view their own shipping photos" on storage.objects;
create policy "Users view their own shipping photos"
on storage.objects for select to authenticated
using (bucket_id = 'shipping-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their own shipping photos" on storage.objects;
create policy "Users upload their own shipping photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'shipping-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their own shipping photos" on storage.objects;
create policy "Users update their own shipping photos"
on storage.objects for update to authenticated
using (bucket_id = 'shipping-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'shipping-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own shipping photos" on storage.objects;
create policy "Users delete their own shipping photos"
on storage.objects for delete to authenticated
using (bucket_id = 'shipping-photos' and (storage.foldername(name))[1] = auth.uid()::text);
