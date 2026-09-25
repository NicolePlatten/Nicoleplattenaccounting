-- Nicole Platten Accounting — V12 potential client preview access
-- Safe additive migration. Existing full clients remain full clients.

alter table public.profiles
  add column if not exists portal_tier text not null default 'full',
  add column if not exists potential_discussion text,
  add column if not exists converted_at timestamptz,
  add column if not exists must_change_password boolean not null default false;

do $$ begin
  alter table public.profiles
    add constraint profiles_portal_tier_check
    check (portal_tier in ('potential','full'));
exception when duplicate_object then null;
end $$;

-- Existing accounts should always remain full clients unless Nicole explicitly creates them as potential.
update public.profiles
set portal_tier='full'
where portal_tier is null;

create index if not exists profiles_portal_tier_idx
  on public.profiles(portal_tier)
  where role='client';

grant update(portal_tier, potential_discussion, converted_at, must_change_password) on public.profiles to authenticated;

-- Existing admin profile UPDATE policy continues to protect these fields.
-- Clients can read their own profile through the existing profile read policy.
