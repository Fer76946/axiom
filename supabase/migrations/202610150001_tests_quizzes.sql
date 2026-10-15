begin;

-- Existing individual assessments remain intact. Shared tests/quizzes are additive.
create table public.tests_quizzes (
  id uuid primary key,
  kind text not null check (kind in ('test', 'quiz')),
  title text not null check (length(trim(title)) between 1 and 120),
  max_score numeric not null check (max_score > 0 and max_score <> 'NaN'::numeric),
  date date not null,
  classes jsonb not null check (jsonb_typeof(classes) = 'array' and jsonb_array_length(classes) between 1 and 100),
  revision bigint not null default 1,
  created_at timestamptz not null default now()
);
create table public.test_quiz_scores (
  test_quiz_id uuid not null references public.tests_quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric check (score >= 0 and score <> 'NaN'::numeric),
  primary key (test_quiz_id, student_id)
);
create index test_quiz_scores_student on public.test_quiz_scores(student_id);
alter table public.tests_quizzes enable row level security;
alter table public.test_quiz_scores enable row level security;
revoke all on public.tests_quizzes, public.test_quiz_scores from public, anon, authenticated;
grant all on public.tests_quizzes, public.test_quiz_scores to service_role;

-- All writes serialize on the shared record. Revision checks prevent stale editors
-- from overwriting scores or changing a maximum while another teacher is grading.
create function public.axiom_save_test_quiz(record_id uuid, expected_revision bigint, details jsonb)
returns public.tests_quizzes language plpgsql set search_path = '' as $$
declare
  item public.tests_quizzes;
  class_item jsonb;
begin
  if details->>'kind' not in ('test', 'quiz') or details->>'kind' is null
    or coalesce(length(trim(details->>'title')), 0) not between 1 and 120
    or jsonb_typeof(details->'classes') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid test or quiz details.';
  end if;
  for class_item in select value from jsonb_array_elements(details->'classes') loop
    if coalesce(length(trim(class_item->>'subject')), 0) not between 1 and 120
      or coalesce(length(trim(class_item->>'section')), 0) not between 1 and 120 then
      raise exception using errcode = '22023', message = 'Choose valid classes.';
    end if;
  end loop;
  if expected_revision is null then
    insert into public.tests_quizzes(id, kind, title, max_score, date, classes)
      values(record_id, details->>'kind', trim(details->>'title'), (details->>'maxScore')::numeric,
        (details->>'date')::date, details->'classes') on conflict (id) do nothing;
    select * into item from public.tests_quizzes where id = record_id for update;
    -- A retry of the same creation cannot create another record or overwrite edits.
    if item.kind is distinct from details->>'kind' or item.title is distinct from trim(details->>'title')
      or item.max_score is distinct from (details->>'maxScore')::numeric
      or item.date is distinct from (details->>'date')::date
      or item.classes is distinct from details->'classes' then
      raise exception using errcode = '40001', message = 'This test or quiz changed. Reload it before saving.';
    end if;
    return item;
  end if;
  select * into item from public.tests_quizzes where id = record_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Test or quiz not found.'; end if;
  if item.revision is distinct from expected_revision then
    raise exception using errcode = '40001', message = 'This test or quiz changed. Reload it before saving.';
  end if;
  if exists (select 1 from public.test_quiz_scores where test_quiz_id = record_id and score > (details->>'maxScore')::numeric) then
    raise exception using errcode = '22023', message = 'Maximum score cannot be lower than an existing student score.';
  end if;
  update public.tests_quizzes set kind = details->>'kind', title = trim(details->>'title'),
    max_score = (details->>'maxScore')::numeric, date = (details->>'date')::date,
    classes = details->'classes', revision = revision + 1 where id = record_id returning * into item;
  return item;
end $$;

create function public.axiom_save_test_quiz_scores(record_id uuid, expected_revision bigint, scores jsonb)
returns void language plpgsql set search_path = '' as $$
declare item public.tests_quizzes;
begin
  select * into item from public.tests_quizzes where id = record_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Test or quiz not found.'; end if;
  if item.revision is distinct from expected_revision then
    raise exception using errcode = '40001', message = 'This test or quiz changed. Reload it before saving.';
  end if;
  if jsonb_typeof(scores) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid scores.';
  end if;
  if jsonb_array_length(scores) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Save between 1 and 1000 changed scores.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(scores) as x("studentId" uuid, score numeric)
    left join public.students s on s.id = x."studentId"
    where s.id is null or (x.score is not null and (x.score < 0 or x.score > item.max_score or x.score = 'NaN'::numeric))
      or not (item.classes @> jsonb_build_array(jsonb_build_object('subject', s.subject, 'section', s.section))
        or exists (select 1 from public.test_quiz_scores old where old.test_quiz_id = record_id and old.student_id = s.id))
  ) then
    raise exception using errcode = '22023', message = 'A score is invalid or a student is outside the selected classes. Reload the score table.';
  end if;
  if (select count(*) <> count(distinct x."studentId") from jsonb_to_recordset(scores) as x("studentId" uuid)) then
    raise exception using errcode = '22023', message = 'Duplicate student scores.';
  end if;
  -- Blank clears a score, returning the student to ungraded. Zero remains a grade.
  delete from public.test_quiz_scores where test_quiz_id = record_id and student_id in (
    select x."studentId" from jsonb_to_recordset(scores) as x("studentId" uuid, score numeric) where x.score is null
  );
  insert into public.test_quiz_scores(test_quiz_id, student_id, score)
    select record_id, x."studentId", x.score from jsonb_to_recordset(scores) as x("studentId" uuid, score numeric) where x.score is not null
    on conflict(test_quiz_id, student_id) do update set score = excluded.score;
  update public.tests_quizzes set revision = revision + 1 where id = record_id;
end $$;

-- Called with the ID resolved from a hashed student token, never a browser-supplied ID.
create function public.axiom_student_tests_quizzes(target_student_id uuid)
returns table (id uuid, kind text, title text, max_score numeric, date date, score numeric)
language sql stable set search_path = '' as $$
  select t.id, t.kind, t.title, t.max_score, t.date, q.score
  from public.students s cross join public.tests_quizzes t
  left join public.test_quiz_scores q on q.test_quiz_id = t.id and q.student_id = s.id
  where s.id = target_student_id and (q.student_id is not null
    or t.classes @> jsonb_build_array(jsonb_build_object('subject', s.subject, 'section', s.section)))
  order by t.date desc, t.created_at desc, t.id;
$$;

revoke all on function public.axiom_save_test_quiz(uuid, bigint, jsonb),
  public.axiom_save_test_quiz_scores(uuid, bigint, jsonb), public.axiom_student_tests_quizzes(uuid)
  from public, anon, authenticated;
grant execute on function public.axiom_save_test_quiz(uuid, bigint, jsonb),
  public.axiom_save_test_quiz_scores(uuid, bigint, jsonb), public.axiom_student_tests_quizzes(uuid) to service_role;
commit;
