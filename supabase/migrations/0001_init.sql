-- OSINT Lens: initial schema. Run in Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto;

-- ─────────────────────────── users (profile) ───────────────────────────
create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  is_investigator boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select to authenticated using (id = auth.uid());
-- No insert/update/delete policies: the investigator flag can only be changed
-- by the service role or from the SQL editor.
revoke all on public.users from anon;
revoke insert, update, delete on public.users from authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────── api_keys ───────────────────────────
-- Holds the user's Gemini key, AES-256-GCM encrypted by the app server.
create table public.api_keys (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  ciphertext   text not null,
  last4        text not null,
  key_version  smallint not null default 1,
  validated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.api_keys enable row level security;

-- Defense in depth: the browser-facing roles may read ONLY non-secret columns.
revoke all on public.api_keys from anon, authenticated;
grant select (user_id, last4, validated_at, created_at) on public.api_keys to authenticated;
create policy "api_keys_select_own_meta" on public.api_keys
  for select to authenticated using (user_id = auth.uid());
-- Writes and ciphertext reads happen only via the service role on the server.

-- ─────────────────────────── search_log ───────────────────────────
create table public.search_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  phash       text,
  mode        text not null check (mode in ('reverse','geo','face','forensics')),
  image_bytes integer,
  width       integer,
  height      integer,
  cache_hit   boolean not null default false,
  status      text not null,          -- ok | error | blocked_nsfw | blocked_id | ...
  error_code  text,
  model       text,
  duration_ms integer,
  ip_hash     text,                   -- HMAC of the IP, never the raw IP
  created_at  timestamptz not null default now()
);
create index search_log_user_created_idx on public.search_log (user_id, created_at desc);
alter table public.search_log enable row level security;

revoke all on public.search_log from anon, authenticated;
grant select (id, user_id, phash, mode, image_bytes, width, height, cache_hit,
              status, error_code, model, duration_ms, created_at)
  on public.search_log to authenticated;
create policy "search_log_select_own" on public.search_log
  for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────── cache_meta ───────────────────────────
-- Bookkeeping for the Redis cache (the cached payload itself lives in Redis).
create table public.cache_meta (
  cache_key   text primary key,
  mode        text not null,
  phash       text not null,
  model       text not null,
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  last_hit_at timestamptz,
  expires_at  timestamptz not null
);
alter table public.cache_meta enable row level security;
revoke all on public.cache_meta from anon, authenticated;
-- No policies: service role only.

create or replace function public.bump_cache_hit(p_key text)
returns void language sql security definer set search_path = public as $$
  update public.cache_meta
     set hit_count = hit_count + 1, last_hit_at = now()
   where cache_key = p_key;
$$;
revoke all on function public.bump_cache_hit(text) from public, anon, authenticated;
grant execute on function public.bump_cache_hit(text) to service_role;

-- ─────────────────────────── moderation_queue ───────────────────────────
-- Metadata only. Images are never stored.
create table public.moderation_queue (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  phash       text not null,
  reason      text not null,
  score       real,
  status      text not null default 'pending' check (status in ('pending','reviewed','escalated','dismissed')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index moderation_queue_status_idx on public.moderation_queue (status, created_at);
alter table public.moderation_queue enable row level security;
revoke all on public.moderation_queue from anon, authenticated;
-- No policies: service role / dashboard only.

-- ─────────────────────────── storage: transient uploads ───────────────────────────
-- Images larger than ~4 MB bypass Vercel's request-body limit by uploading here via
-- a signed URL. The server reads the file once and deletes it immediately.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- No storage.objects policies are needed: signed upload URLs carry their own token,
-- and all reads/deletes use the service role.
