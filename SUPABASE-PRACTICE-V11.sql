-- Nicole Platten Accounting — V11 practice management upgrade
-- Safe additive migration. Existing data is not deleted.

create or replace function public.is_npa_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

grant execute on function public.is_npa_admin() to authenticated;

alter table public.profiles add column if not exists login_email text;
update public.profiles p set login_email=u.email from auth.users u where p.id=u.id and (p.login_email is null or p.login_email<>u.email);
create index if not exists profiles_login_email_idx on public.profiles(lower(login_email));

create or replace function public.npa_sync_profile_email() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if new.login_email is null then select email into new.login_email from auth.users where id=new.id; end if;
  return new;
end;$$;
drop trigger if exists npa_profile_email_sync on public.profiles;
create trigger npa_profile_email_sync before insert or update on public.profiles for each row execute function public.npa_sync_profile_email();

create table if not exists public.client_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  completed boolean not null default false,
  client_action_required boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_onboarding_items_client_idx on public.client_onboarding_items(client_id, position);
alter table public.client_onboarding_items enable row level security;
drop policy if exists "npa admin manages onboarding" on public.client_onboarding_items;
create policy "npa admin manages onboarding" on public.client_onboarding_items for all to authenticated using (public.is_npa_admin()) with check (public.is_npa_admin());
drop policy if exists "clients view own onboarding" on public.client_onboarding_items;
create policy "clients view own onboarding" on public.client_onboarding_items for select to authenticated using (client_id = auth.uid());

create table if not exists public.client_document_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  note text,
  due_date date,
  status text not null default 'requested' check (status in ('requested','received','cancelled')),
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists client_document_requests_client_idx on public.client_document_requests(client_id, status, due_date);
alter table public.client_document_requests enable row level security;
drop policy if exists "npa admin manages document requests" on public.client_document_requests;
create policy "npa admin manages document requests" on public.client_document_requests for all to authenticated using (public.is_npa_admin()) with check (public.is_npa_admin());
drop policy if exists "clients view own document requests" on public.client_document_requests;
create policy "clients view own document requests" on public.client_document_requests for select to authenticated using (client_id = auth.uid());
drop policy if exists "clients update own document requests" on public.client_document_requests;
create policy "clients update own document requests" on public.client_document_requests for update to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());
revoke update on public.client_document_requests from authenticated;
grant update(status, received_at, updated_at) on public.client_document_requests to authenticated;

create table if not exists public.client_internal_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists client_internal_notes_client_idx on public.client_internal_notes(client_id, created_at desc);
alter table public.client_internal_notes enable row level security;
drop policy if exists "npa admin manages internal notes" on public.client_internal_notes;
create policy "npa admin manages internal notes" on public.client_internal_notes for all to authenticated using (public.is_npa_admin()) with check (public.is_npa_admin());

create table if not exists public.work_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type text not null default 'other',
  cadence text not null default 'quarterly' check (cadence in ('monthly','quarterly','annual')),
  client_label text not null default 'Next due date',
  remind_14_days boolean not null default true,
  remind_7_days boolean not null default true,
  auto_create_work boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.work_templates enable row level security;
drop policy if exists "npa admin manages work templates" on public.work_templates;
create policy "npa admin manages work templates" on public.work_templates for all to authenticated using (public.is_npa_admin()) with check (public.is_npa_admin());

-- Create standard onboarding checklist for a client if they do not have one yet.
create or replace function public.ensure_client_onboarding(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_npa_admin() then raise exception 'Not authorised'; end if;
  if not exists(select 1 from public.client_onboarding_items where client_id = p_client_id) then
    insert into public.client_onboarding_items(client_id,title,position,client_action_required) values
      (p_client_id,'Engagement letter signed',10,true),
      (p_client_id,'ID / AML checks complete',20,true),
      (p_client_id,'UTR / company details received',30,true),
      (p_client_id,'Previous accountant information received',40,true),
      (p_client_id,'Software / bookkeeping access set up',50,true),
      (p_client_id,'Payment / direct debit set up',60,true);
  end if;
end;
$$;
grant execute on function public.ensure_client_onboarding(uuid) to authenticated;

alter table public.client_work add column if not exists source_schedule_id uuid references public.client_schedules(id) on delete set null;
alter table public.client_work add column if not exists source_due_date date;
create unique index if not exists client_work_source_schedule_due_unique on public.client_work(source_schedule_id, source_due_date) where source_schedule_id is not null and source_due_date is not null;

-- Creates work items for due schedules once only. It can be called whenever Nicole opens the admin portal,
-- and can also be scheduled with Supabase Cron if the cron extension is enabled.
create or replace function public.npa_create_due_work()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare created_count integer := 0;
begin
  if auth.uid() is not null and not public.is_npa_admin() then raise exception 'Not authorised'; end if;
  insert into public.client_work(
    client_id, service_name, period_label, workflow_type, stages, progress, status,
    current_stage, next_action, is_active, source_schedule_id, source_due_date, updated_at
  )
  select s.client_id,
         s.title,
         to_char(s.next_due_date,'Mon YYYY'),
         case when s.service_type in ('annual_accounts','bookkeeping','vat','payroll','self_assessment') then s.service_type else 'custom' end,
         '[{"name":"Package and fee agreed","completed":false},{"name":"Onboarding documentation and invoice sent to client","completed":false},{"name":"Documents received back from client","completed":false},{"name":"Client/business information received","completed":false},{"name":"Invoice paid","completed":false},{"name":"Work in progress","completed":false},{"name":"Work completed awaiting approval","completed":false},{"name":"Approval from client","completed":false},{"name":"Work submitted","completed":false}]'::jsonb,
         0,'In progress','Package and fee agreed','Nothing needed right now',true,s.id,s.next_due_date,now()
  from public.client_schedules s
  where s.is_active = true and s.auto_create_work = true and s.next_due_date <= current_date
    and not exists(select 1 from public.client_work w where w.source_schedule_id=s.id and w.source_due_date=s.next_due_date);
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;
grant execute on function public.npa_create_due_work() to authenticated;

-- Optional automatic daily run when Supabase Cron / pg_cron is already enabled.
do $$
begin
  if to_regnamespace('cron') is not null then
    if not exists(select 1 from cron.job where jobname='npa-create-due-work') then
      perform cron.schedule('npa-create-due-work','15 6 * * *','select public.npa_create_due_work();');
    end if;
  end if;
exception when others then
  raise notice 'Cron schedule was not created; the admin portal will still process due work when Nicole logs in.';
end $$;
