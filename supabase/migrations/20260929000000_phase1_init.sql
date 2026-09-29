-- =====================================================================
-- Nabohjelp Pro — FASE 1: Database schema (Supabase / PostgreSQL + PostGIS)
-- Test phase: all services are FREE (payment_mode = 'test_free').
-- Escrow-ready: bookings carry escrow_status (held/released/disputed/...)
-- that is SIMULATED with amount 0 today and driven by a real PSP later.
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type public.task_category as enum (
  'loan_item',      -- lån: lader, verktøy ...
  'pet_sitting',
  'home_check',     -- tilsyn av leilighet
  'small_repair',
  'other'
);

create type public.pricing_type as enum ('free', 'loan', 'paid');

create type public.task_status as enum (
  'open', 'assigned', 'in_progress', 'completed', 'cancelled'
);

create type public.booking_status as enum (
  'requested', 'accepted', 'declined', 'in_progress',
  'completed', 'cancelled', 'disputed'
);

create type public.payment_mode as enum ('test_free', 'live');

create type public.escrow_status as enum (
  'not_required',   -- no payment involved
  'pending',        -- awaiting payment authorisation (live)
  'held',           -- funds held (simulated in test_free)
  'released',       -- paid out to helper
  'refunded',       -- returned to task owner
  'disputed'        -- frozen pending resolution
);

-- ---------------------------------------------------------------------
-- SHARED: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text        check (char_length(full_name) <= 120),
  avatar_url     text,
  bio            text        check (char_length(bio) <= 1000),
  phone          text        check (phone ~ '^\+?[0-9 ]{6,20}$'),
  -- private address (never exposed to other users, see public_profiles)
  address_line   text        check (char_length(address_line) <= 200),
  postal_code    text        check (postal_code ~ '^[0-9]{4}$'),   -- NO postnummer
  city           text        not null default 'Oslo',
  country_code   char(2)     not null default 'NO',
  location       extensions.geography(Point, 4326),
  rating_avg     numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count   integer     not null default 0 check (rating_count >= 0),
  is_verified    boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index profiles_location_gix on public.profiles using gist (location);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Users may not self-edit trust fields (rating / verification).
create or replace function public.profiles_protect_fields()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.rating_avg   := old.rating_avg;
    new.rating_count := old.rating_count;
    new.is_verified  := old.is_verified;
  end if;
  return new;
end $$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.profiles_protect_fields();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid        not null references public.profiles (id) on delete cascade,
  title          text        not null check (char_length(title) between 3 and 120),
  description    text        check (char_length(description) <= 4000),
  category       public.task_category not null,
  pricing_type   public.pricing_type  not null default 'free',
  -- amounts in øre (1 NOK = 100 øre); 0 during test phase
  price_ore      integer     not null default 0 check (price_ore >= 0),
  currency       char(3)     not null default 'NOK',
  status         public.task_status   not null default 'open',
  -- approximate public location (~neighbourhood), NOT the exact address
  location       extensions.geography(Point, 4326) not null,
  area_label     text        check (char_length(area_label) <= 80), -- e.g. "Grünerløkka"
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tasks_price_matches_type
    check ((pricing_type = 'paid') or price_ore = 0),
  constraint tasks_time_range
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index tasks_location_gix     on public.tasks using gist (location);
create index tasks_status_idx       on public.tasks (status, created_at desc);
create index tasks_owner_idx        on public.tasks (owner_id);
create index tasks_category_idx     on public.tasks (category);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- BOOKINGS (escrow-ready)
-- ---------------------------------------------------------------------
create table public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid        not null references public.tasks (id) on delete cascade,
  owner_id           uuid        not null references public.profiles (id) on delete cascade, -- task owner (denormalised, set by trigger)
  helper_id          uuid        not null references public.profiles (id) on delete cascade,
  status             public.booking_status not null default 'requested',
  message            text        check (char_length(message) <= 1000),

  -- ---- payment / escrow (future) ----
  payment_mode       public.payment_mode   not null default 'test_free',
  is_simulated       boolean     generated always as (payment_mode = 'test_free') stored,
  amount_ore         integer     not null default 0 check (amount_ore >= 0),
  platform_fee_ore   integer     not null default 0 check (platform_fee_ore >= 0),
  currency           char(3)     not null default 'NOK',
  escrow_status      public.escrow_status  not null default 'not_required',
  payment_provider   text        check (payment_provider in ('vipps', 'stripe')),
  payment_reference  text,
  escrow_held_at     timestamptz,
  escrow_released_at timestamptz,
  disputed_at        timestamptz,
  dispute_reason     text        check (char_length(dispute_reason) <= 2000),

  accepted_at        timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint bookings_unique_helper_per_task unique (task_id, helper_id),
  constraint bookings_not_self check (owner_id <> helper_id),
  -- Test phase guard: no real money can move while test_free
  constraint bookings_test_free_no_money check (
    payment_mode <> 'test_free'
    or (amount_ore = 0 and platform_fee_ore = 0
        and payment_provider is null and payment_reference is null)
  ),
  constraint bookings_dispute_reason check (
    status <> 'disputed' or dispute_reason is not null
  )
);

create index bookings_task_idx    on public.bookings (task_id);
create index bookings_owner_idx   on public.bookings (owner_id, status);
create index bookings_helper_idx  on public.bookings (helper_id, status);
-- only one accepted/active booking per task
create unique index bookings_one_active_per_task
  on public.bookings (task_id)
  where status in ('accepted', 'in_progress', 'completed', 'disputed');

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- INSERT guard: fill owner_id, validate task, force test-mode defaults
create or replace function public.bookings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then
    raise exception 'Task not found';
  end if;
  if t.status <> 'open' then
    raise exception 'Task is not open for booking';
  end if;

  new.owner_id := t.owner_id;
  new.status   := 'requested';

  if coalesce(auth.role(), '') <> 'service_role' then
    -- clients can never set payment/escrow fields
    new.payment_mode      := 'test_free';
    new.amount_ore        := 0;
    new.platform_fee_ore  := 0;
    new.currency          := t.currency;
    new.escrow_status     := 'not_required';
    new.payment_provider  := null;
    new.payment_reference := null;
    new.escrow_held_at := null; new.escrow_released_at := null; new.disputed_at := null;
  end if;
  return new;
end $$;

create trigger bookings_before_insert
  before insert on public.bookings
  for each row execute function public.bookings_before_insert();

-- UPDATE guard: role-based status state machine + simulated escrow
create or replace function public.bookings_before_update()
returns trigger
language plpgsql
as $$
declare
  uid        uuid := auth.uid();
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
  is_owner   boolean := uid = old.owner_id;
  is_helper  boolean := uid = old.helper_id;
  ok         boolean := false;
begin
  -- immutable identity columns
  if new.task_id <> old.task_id or new.owner_id <> old.owner_id or new.helper_id <> old.helper_id then
    raise exception 'Booking parties cannot be changed';
  end if;

  if not is_service then
    -- clients cannot touch money/escrow columns
    if (new.payment_mode, new.amount_ore, new.platform_fee_ore, new.currency,
        new.escrow_status, new.payment_provider, new.payment_reference,
        new.escrow_held_at, new.escrow_released_at, new.disputed_at)
       is distinct from
       (old.payment_mode, old.amount_ore, old.platform_fee_ore, old.currency,
        old.escrow_status, old.payment_provider, old.payment_reference,
        old.escrow_held_at, old.escrow_released_at, old.disputed_at) then
      raise exception 'Payment/escrow fields are server-managed';
    end if;

    if new.status is distinct from old.status then
      ok := case
        when old.status = 'requested'   and new.status in ('accepted','declined') then is_owner
        when old.status = 'requested'   and new.status = 'cancelled'              then is_helper
        when old.status = 'accepted'    and new.status = 'in_progress'            then is_owner or is_helper
        when old.status = 'accepted'    and new.status = 'cancelled'              then is_owner or is_helper
        when old.status = 'in_progress' and new.status = 'completed'              then is_owner
        when old.status in ('accepted','in_progress','completed')
                                        and new.status = 'disputed'               then is_owner or is_helper
        else false
      end;
      if not ok then
        raise exception 'Invalid status transition % -> % for this user', old.status, new.status;
      end if;
    end if;
  end if;

  -- timestamps + simulated escrow lifecycle (test_free)
  if new.status is distinct from old.status then
    case new.status
      when 'accepted'  then new.accepted_at  := now();
      when 'completed' then new.completed_at := now();
      when 'cancelled' then new.cancelled_at := now();
      when 'declined'  then new.cancelled_at := now();
      when 'disputed'  then new.disputed_at  := now();
      else null;
    end case;

    if new.payment_mode = 'test_free' then
      new.escrow_status := case new.status
        when 'accepted'    then 'held'::public.escrow_status
        when 'in_progress' then 'held'
        when 'completed'   then 'released'
        when 'disputed'    then 'disputed'
        when 'cancelled'   then case when old.escrow_status = 'held' then 'refunded'::public.escrow_status else old.escrow_status end
        else old.escrow_status
      end;
      if new.escrow_status = 'held' and old.escrow_status <> 'held' then new.escrow_held_at := now(); end if;
      if new.escrow_status = 'released' then new.escrow_released_at := now(); end if;
    end if;
  end if;

  return new;
end $$;

create trigger bookings_before_update
  before update on public.bookings
  for each row execute function public.bookings_before_update();

-- AFTER: keep task status in sync with its active booking
create or replace function public.bookings_sync_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    update public.tasks set status = case new.status
        when 'accepted'    then 'assigned'::public.task_status
        when 'in_progress' then 'in_progress'
        when 'completed'   then 'completed'
        when 'cancelled'   then case when old.status in ('accepted','in_progress') then 'open'::public.task_status else status end
        else status
      end
    where id = new.task_id;

    -- auto-decline other pending requests once one is accepted
    if new.status = 'accepted' then
      update public.bookings
         set status = 'declined', cancelled_at = now()
       where task_id = new.task_id and id <> new.id and status = 'requested';
    end if;
  end if;
  return null;
end $$;

create trigger bookings_sync_task
  after update on public.bookings
  for each row execute function public.bookings_sync_task();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;
alter table public.bookings enable row level security;

-- PROFILES: full row (incl. address) only for the owner
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- insert happens via handle_new_user(); no client insert/delete policy

-- Public-safe projection of profiles (no address/phone, location fuzzed ~1 km).
-- Runs with owner rights by design so others' rows are readable, but only these columns.
create view public.public_profiles as
  select id, full_name, avatar_url, bio, city, rating_avg, rating_count, is_verified,
         extensions.st_snaptogrid(location::extensions.geometry, 0.01)::extensions.geography as approx_location,
         created_at
    from public.profiles;
revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- TASKS
create policy tasks_select on public.tasks
  for select to authenticated using (
    status = 'open'
    or owner_id = auth.uid()
    or exists (select 1 from public.bookings b
               where b.task_id = tasks.id and b.helper_id = auth.uid())
  );
create policy tasks_insert_own on public.tasks
  for insert to authenticated with check (owner_id = auth.uid() and status = 'open');
create policy tasks_update_own on public.tasks
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy tasks_delete_own on public.tasks
  for delete to authenticated using (
    owner_id = auth.uid()
    and not exists (select 1 from public.bookings b
                    where b.task_id = tasks.id
                      and b.status in ('accepted','in_progress','disputed'))
  );

-- Test phase: block paid tasks from clients until live payments exist
create or replace function public.tasks_test_phase_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and new.pricing_type = 'paid' then
    raise exception 'Paid tasks are disabled during the free test phase';
  end if;
  return new;
end $$;

create trigger tasks_test_phase_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_test_phase_guard();

-- BOOKINGS: only the two parties
create policy bookings_select_party on public.bookings
  for select to authenticated using (auth.uid() in (owner_id, helper_id));
create policy bookings_insert_helper on public.bookings
  for insert to authenticated with check (
    helper_id = auth.uid()
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.status = 'open' and t.owner_id <> auth.uid())
  );
create policy bookings_update_party on public.bookings
  for update to authenticated
  using (auth.uid() in (owner_id, helper_id))
  with check (auth.uid() in (owner_id, helper_id));
-- no delete: bookings are an audit trail (cancel instead)

-- ---------------------------------------------------------------------
-- GEO: nearby open tasks (RLS applies — security invoker)
-- ---------------------------------------------------------------------
create or replace function public.nearby_tasks(
  lat double precision,
  lng double precision,
  radius_m integer default 3000,
  p_category public.task_category default null
)
returns table (
  id uuid, owner_id uuid, title text, category public.task_category,
  pricing_type public.pricing_type, area_label text, status public.task_status,
  distance_m double precision, created_at timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  select t.id, t.owner_id, t.title, t.category, t.pricing_type, t.area_label, t.status,
         st_distance(t.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m,
         t.created_at
    from public.tasks t
   where t.status = 'open'
     and (p_category is null or t.category = p_category)
     and st_dwithin(t.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography,
                    least(greatest(radius_m, 100), 50000))
   order by distance_m
   limit 100;
$$;

grant execute on function public.nearby_tasks(double precision, double precision, integer, public.task_category) to authenticated;
