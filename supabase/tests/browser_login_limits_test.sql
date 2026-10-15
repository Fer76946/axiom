-- Run against a migrated staging/test database as its owner:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/browser_login_limits_test.sql
-- All test data and bucket changes are rolled back.
begin;
do $$
declare
  browser text := repeat('a', 64);
  other_browser text := repeat('b', 64);
  code text;
  bad_code text;
  test_student_id uuid := gen_random_uuid();
  result jsonb;
  first_block timestamptz;
  failures integer;
  saved_code text;
begin
  select lpad(n::text, 7, '0') into strict code from generate_series(0, 9999999) n
    where not exists (select 1 from public.students where access_code = lpad(n::text, 7, '0')) limit 1;
  insert into public.students(id, name, subject, section, access_code)
    values (test_student_id, 'Rate limit test student', 'Test', 'Test', code);
  select lpad(n::text, 7, '0') into strict bad_code from generate_series(0, 9999999) n
    where not exists (select 1 from public.students where access_code = lpad(n::text, 7, '0')) limit 1;
  delete from public.student_login_limits where browser_key in (browser, other_browser);

  -- Nine failures are allowed, the tenth immediately starts the cooldown.
  for attempt in 1..10 loop
    result := public.axiom_student_login(browser,
      case when attempt % 2 = 0 then bad_code else null end, repeat('c', 64));
    if result->>'status' <> (case when attempt = 10 then 'blocked' else 'invalid' end) then
      raise exception 'Unexpected result for failure %: %', attempt, result;
    end if;
  end loop;
  if (result->>'retryAfterSeconds')::integer <> 300 then raise exception 'Expected five-minute cooldown'; end if;
  select blocked_until into first_block from public.student_login_limits where browser_key = browser;
  if first_block < clock_timestamp() + interval '299 seconds'
    or first_block > clock_timestamp() + interval '301 seconds' then raise exception 'Wrong cooldown expiry'; end if;
  result := public.axiom_student_login(browser, code, repeat('c', 64));
  if result->>'status' <> 'blocked' then raise exception 'Correct code bypassed cooldown'; end if;
  if exists(select 1 from public.student_sessions where student_id = test_student_id) then
    raise exception 'Blocked login created a session';
  end if;
  if (select blocked_until from public.student_login_limits where browser_key = browser) <> first_block then
    raise exception 'Blocked requests extended cooldown';
  end if;

  -- A different browser is independent; successful login clears its failures.
  perform public.axiom_student_login(other_browser, null, repeat('d', 64));
  result := public.axiom_student_login(other_browser, code, repeat('d', 64));
  if result->>'status' <> 'ok' or result->'student'->>'id' <> test_student_id::text then
    raise exception 'Different browser could not log in';
  end if;
  if result->'student' ? 'accessCode' or result->'student' ? 'access_code' then raise exception 'Code exposed'; end if;
  if abs(extract(epoch from (result->>'expiresAt')::timestamptz - clock_timestamp()) - 28800) > 2 then
    raise exception 'Session lifetime changed';
  end if;
  select cardinality(failed_at) into failures from public.student_login_limits where browser_key = other_browser;
  if failures <> 0 then raise exception 'Success did not reset failures'; end if;
  perform public.axiom_student_login(other_browser, null, repeat('e', 64));
  select cardinality(failed_at) into failures from public.student_login_limits where browser_key = other_browser;
  if failures <> 1 then raise exception 'New failure was not counted from zero'; end if;

  -- Expired cooldown grants a fresh failure budget, even with recent old failures.
  update public.student_login_limits set blocked_until = clock_timestamp() - interval '1 second'
    where browser_key = browser;
  result := public.axiom_student_login(browser, null, repeat('c', 64));
  select cardinality(failed_at) into failures from public.student_login_limits where browser_key = browser;
  if result->>'status' <> 'invalid' or failures <> 1 then raise exception 'Cooldown did not reset budget'; end if;

  update public.student_login_limits set failed_at = array_fill(clock_timestamp() - interval '11 minutes', array[9])
    where browser_key = browser;
  result := public.axiom_student_login(browser, bad_code, repeat('c', 64));
  select cardinality(failed_at) into failures from public.student_login_limits where browser_key = browser;
  if result->>'status' <> 'invalid' or failures <> 1 then raise exception 'Old failures did not expire'; end if;

  -- Expiry is rolling, not a fixed window: only nine recent failures survive.
  update public.student_login_limits set failed_at = array[
    clock_timestamp() - interval '11 minutes', clock_timestamp() - interval '9 minutes',
    clock_timestamp() - interval '8 minutes', clock_timestamp() - interval '7 minutes',
    clock_timestamp() - interval '6 minutes', clock_timestamp() - interval '5 minutes',
    clock_timestamp() - interval '4 minutes', clock_timestamp() - interval '3 minutes',
    clock_timestamp() - interval '2 minutes'] where browser_key = browser;
  result := public.axiom_student_login(browser, null, repeat('c', 64));
  select cardinality(failed_at) into failures from public.student_login_limits where browser_key = browser;
  if result->>'status' <> 'invalid' or failures <> 9 then raise exception 'Rolling window incorrect'; end if;
  result := public.axiom_student_login(browser, null, repeat('c', 64));
  if result->>'status' <> 'blocked' then raise exception 'Rolling tenth failure did not block'; end if;

  -- Correct code succeeds after cooldown and never changes the stored code.
  update public.student_login_limits set blocked_until = clock_timestamp() - interval '1 second'
    where browser_key = browser;
  result := public.axiom_student_login(browser, code, repeat('c', 64));
  if result->>'status' <> 'ok' then raise exception 'Cooldown permanently locked login'; end if;
  select access_code into saved_code from public.students s where s.id = test_student_id;
  if saved_code <> code then raise exception 'Access code changed'; end if;

  -- A session-insert error must roll back any reset, preserving existing failures.
  perform public.axiom_student_login(browser, null, repeat('f', 64));
  begin
    perform public.axiom_student_login(browser, code, repeat('c', 64));
    raise exception 'Duplicate session token should fail';
  exception when unique_violation then null;
  end;
  select cardinality(failed_at) into failures from public.student_login_limits where browser_key = browser;
  if failures <> 1 then raise exception 'Failed transaction reset the bucket'; end if;

  -- Browser roles cannot call the privileged function or modify buckets.
  if not has_function_privilege('service_role', 'public.axiom_student_login(text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.axiom_student_login(text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.axiom_student_login(text,text,text)', 'EXECUTE')
    or has_table_privilege('anon', 'public.student_login_limits', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.student_login_limits', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Limiter is exposed to browser roles';
  end if;
  if to_regprocedure('public.axiom_allow_student_login(text)') is not null
    or to_regclass('public.student_login_attempts') is not null then raise exception 'Old address limiter remains'; end if;

  -- Cleanup removes inactive buckets and expired sessions, retaining active limits.
  insert into public.student_sessions(token_hash, student_id, expires_at)
    values (repeat('f', 64), test_student_id, now() - interval '1 hour');
  update public.student_login_limits set updated_at = now() - interval '2 days' where browser_key = other_browser;
  perform public.axiom_cleanup_student_login_limits();
  if exists(select 1 from public.student_login_limits where browser_key = other_browser)
    or not exists(select 1 from public.student_login_limits where browser_key = browser)
    or exists(select 1 from public.student_sessions where token_hash = repeat('f', 64)) then
    raise exception 'Cleanup removed the wrong buckets';
  end if;
end $$;
rollback;
