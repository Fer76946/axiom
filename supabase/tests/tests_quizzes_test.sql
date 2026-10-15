-- Run only against a disposable/staging database after both migrations.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/tests_quizzes_test.sql
-- Fixtures and all writes are rolled back, including when an assertion fails.
begin;
do $$
declare
  first_student uuid := gen_random_uuid();
  second_student uuid := gen_random_uuid();
  outside_student uuid := gen_random_uuid();
  quiz_id uuid := gen_random_uuid();
  first_code text;
  second_code text;
  third_code text;
  details jsonb := '{"kind":"quiz","title":"SQL fixture quiz","date":"2026-10-15","maxScore":20,"classes":[{"subject":"SQL fixture science","section":"6A"},{"subject":"SQL fixture science","section":"6B"}]}';
  item public.tests_quizzes;
  saved_revision bigint;
begin
  select lpad(n::text, 7, '0') into first_code from generate_series(9900000,9999999) n
    where not exists(select 1 from public.students where access_code = lpad(n::text, 7, '0')) limit 1;
  select lpad(n::text, 7, '0') into second_code from generate_series(9900000,9999999) n
    where lpad(n::text, 7, '0') <> first_code
      and not exists(select 1 from public.students where access_code = lpad(n::text, 7, '0')) limit 1;
  select lpad(n::text, 7, '0') into third_code from generate_series(9900000,9999999) n
    where lpad(n::text, 7, '0') not in (first_code, second_code)
      and not exists(select 1 from public.students where access_code = lpad(n::text, 7, '0')) limit 1;
  insert into public.students(id, name, subject, section, access_code) values
    (first_student, 'SQL fixture A', 'SQL fixture science', '6A', first_code),
    (second_student, 'SQL fixture B', 'SQL fixture science', '6B', second_code),
    (outside_student, 'SQL fixture C', 'SQL fixture science', '6C', third_code);
  item := public.axiom_save_test_quiz(quiz_id, null, details);
  if item.revision <> 1 then raise exception 'Creation failed'; end if;
  item := public.axiom_save_test_quiz(quiz_id, null, details);
  if item.revision <> 1 then raise exception 'Creation retry was not idempotent'; end if;
  if (select count(*) from public.axiom_student_tests_quizzes(first_student) where id=quiz_id and score is null) <> 1 then
    raise exception 'Applicable ungraded test is missing';
  end if;
  if exists(select 1 from public.axiom_student_tests_quizzes(outside_student) where id=quiz_id) then
    raise exception 'Test leaked to an unassigned class';
  end if;
  perform public.axiom_save_test_quiz_scores(quiz_id, 1, jsonb_build_array(
    jsonb_build_object('studentId', first_student, 'score', 0), jsonb_build_object('studentId', second_student, 'score', 15)));
  if (select score from public.axiom_student_tests_quizzes(first_student) where id=quiz_id) is distinct from 0::numeric then
    raise exception 'Zero was treated as blank';
  end if;
  begin
    perform public.axiom_save_test_quiz_scores(quiz_id, 1, jsonb_build_array(jsonb_build_object('studentId', first_student, 'score', 2)));
    raise exception 'Stale score edit was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.axiom_save_test_quiz_scores(quiz_id, 2, jsonb_build_array(
      jsonb_build_object('studentId', first_student, 'score', 10), jsonb_build_object('studentId', second_student, 'score', 21)));
    raise exception 'Out-of-range score was accepted';
  exception when invalid_parameter_value then null; end;
  if (select score from public.test_quiz_scores where test_quiz_id=quiz_id and student_id=first_student) <> 0 then
    raise exception 'Invalid batch partially committed';
  end if;
  begin
    perform public.axiom_save_test_quiz_scores(quiz_id, 2, jsonb_build_array(jsonb_build_object('studentId', outside_student, 'score', 10)));
    raise exception 'Outside-class score was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.axiom_save_test_quiz(quiz_id, 2, jsonb_set(details, '{maxScore}', '10'));
    raise exception 'Maximum was reduced below a saved score';
  exception when invalid_parameter_value then null; end;
  item := public.axiom_save_test_quiz(quiz_id, 2, jsonb_set(details, '{title}', '"Edited quiz"'));
  saved_revision := item.revision;
  if item.title <> 'Edited quiz' then raise exception 'Details were not edited'; end if;
  update public.students set section='6C' where id=second_student;
  if (select score from public.axiom_student_tests_quizzes(second_student) where id=quiz_id) is distinct from 15::numeric then
    raise exception 'Moving class lost a saved score';
  end if;
  perform public.axiom_save_test_quiz_scores(quiz_id, saved_revision, jsonb_build_array(jsonb_build_object('studentId', first_student, 'score', null)));
  if (select score from public.axiom_student_tests_quizzes(first_student) where id=quiz_id) is not null then
    raise exception 'Clearing a score did not restore ungraded';
  end if;
  if has_table_privilege('anon', 'public.test_quiz_scores', 'SELECT')
    or has_table_privilege('authenticated', 'public.tests_quizzes', 'INSERT')
    or has_function_privilege('authenticated', 'public.axiom_student_tests_quizzes(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.axiom_save_test_quiz_scores(uuid,bigint,jsonb)', 'EXECUTE') then
    raise exception 'Browser roles have direct shared-test access';
  end if;
  delete from public.tests_quizzes where id=quiz_id;
  if exists(select 1 from public.test_quiz_scores where test_quiz_id=quiz_id) then raise exception 'Score cleanup failed'; end if;
  raise notice 'Tests & Quizzes database checks passed';
end $$;
rollback;
