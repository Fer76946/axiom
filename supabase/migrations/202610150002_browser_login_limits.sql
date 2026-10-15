begin;

-- Browser buckets contain no student IDs, access codes, or network addresses.
create table public.student_login_limits (
  browser_key text primary key check (browser_key ~ '^[a-f0-9]{64}$'),
  failed_at timestamptz[] not null default '{}'
    check (cardinality(failed_at) <= 10),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create index student_login_limits_updated on public.student_login_limits(updated_at);
alter table public.student_login_limits enable row level security;
revoke all on public.student_login_limits from public, anon, authenticated;
grant all on public.student_login_limits to service_role;

-- One transaction serializes the check, code lookup, failure update, and session
-- creation. Returning failures (rather than raising) commits the updated bucket.
create function public.axiom_student_login(
  p_browser_key text,
  p_access_code text,
  p_token_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  bucket public.student_login_limits%rowtype;
  matched public.students%rowtype;
  checked_at timestamptz;
  recent_failures timestamptz[];
  session_expiry timestamptz;
begin
  if p_browser_key is null or p_browser_key !~ '^[a-f0-9]{64}$'
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid login request';
  end if;

  insert into public.student_login_limits(browser_key) values (p_browser_key)
    on conflict (browser_key) do nothing;
  select * into strict bucket from public.student_login_limits
    where browser_key = p_browser_key for update;
  -- Read the clock after acquiring the lock, not at transaction start.
  checked_at := clock_timestamp();

  if bucket.blocked_until > checked_at then
    return jsonb_build_object('status', 'blocked', 'retryAfterSeconds',
      ceil(extract(epoch from bucket.blocked_until - checked_at))::integer);
  end if;

  if bucket.blocked_until is not null then
    recent_failures := '{}';
  else
    select coalesce(array_agg(failed order by failed), '{}'::timestamptz[])
      into recent_failures from unnest(bucket.failed_at) as failures(failed)
      where failed > checked_at - interval '10 minutes';
  end if;

  -- Malformed codes count as failures too; never coerce away leading zeroes.
  if p_access_code ~ '^[0-9]{7}$' then
    select * into matched from public.students where access_code = p_access_code;
  end if;
  if matched.id is null then
    recent_failures := array_append(recent_failures, checked_at);
    update public.student_login_limits set
      failed_at = recent_failures,
      blocked_until = case when cardinality(recent_failures) >= 10
        then checked_at + interval '5 minutes' else null end,
      updated_at = checked_at
      where browser_key = p_browser_key;
    if cardinality(recent_failures) >= 10 then
      return jsonb_build_object('status', 'blocked', 'retryAfterSeconds', 300);
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  session_expiry := checked_at + interval '8 hours';
  insert into public.student_sessions(token_hash, student_id, expires_at)
    values (p_token_hash, matched.id, session_expiry);
  update public.student_login_limits set failed_at = '{}', blocked_until = null,
    updated_at = checked_at where browser_key = p_browser_key;
  return jsonb_build_object('status', 'ok', 'expiresAt', session_expiry,
    'student', jsonb_build_object('id', matched.id, 'name', matched.name,
      'subject', matched.subject, 'section', matched.section));
end $$;
revoke all on function public.axiom_student_login(text, text, text) from public, anon, authenticated;
grant execute on function public.axiom_student_login(text, text, text) to service_role;

-- Remove the old address-based limiter and its retained hashes. Old server
-- versions fail closed until both login-capable Edge Functions are updated.
drop function public.axiom_allow_student_login(text);
drop table public.student_login_attempts;

-- Run periodically with service-role privileges (e.g. a daily maintenance job).
create function public.axiom_cleanup_student_login_limits() returns void
language sql security definer set search_path = '' as $$
  delete from public.student_login_limits
    where updated_at < now() - interval '1 day'
      and (blocked_until is null or blocked_until <= now());
  delete from public.student_sessions where expires_at <= now();
$$;
revoke all on function public.axiom_cleanup_student_login_limits() from public, anon, authenticated;
grant execute on function public.axiom_cleanup_student_login_limits() to service_role;
commit;
