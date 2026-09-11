-- Nicole Platten Accounting client portal schema
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'client' check (role in ('client','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.client_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  client_name text,
  service text,
  status text default 'In progress',
  progress integer default 0 check (progress between 0 and 100),
  current_stage text default 'Information received',
  next_action text default 'Nothing needed right now',
  next_action_detail text,
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;
alter table public.profiles enable row level security; alter table public.client_records enable row level security; alter table public.messages enable row level security;
create policy "profile own or admin read" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "admin profile update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "client own record read" on public.client_records for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "admin records insert" on public.client_records for insert to authenticated with check (public.is_admin());
create policy "admin records update" on public.client_records for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin records delete" on public.client_records for delete to authenticated using (public.is_admin());
create policy "messages own or admin read" on public.messages for select to authenticated using (client_user_id=auth.uid() or public.is_admin());
create policy "admin messages insert" on public.messages for insert to authenticated with check (public.is_admin());
create policy "admin messages update" on public.messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.profiles to authenticated; grant update(full_name) on public.profiles to authenticated; grant select,insert,update,delete on public.client_records to authenticated; grant select,insert,update on public.messages to authenticated; grant usage,select on sequence public.messages_id_seq to authenticated;
-- After creating Nicole in Authentication > Users, run this once with her real email:
-- insert into public.profiles(id,email,full_name,role) select id,email,'Nicole Platten','admin' from auth.users where email='NICOLES_LOGIN_EMAIL' on conflict(id) do update set role='admin';
