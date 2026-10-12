-- Run separately in Supabase SQL Editor before retrying the MVP migration.
-- Changes only missing/malformed access codes. Existing valid codes and all IDs/grades remain intact.
begin;
lock table public.students in share row exclusive mode;

do $$
declare
  student_row record;
  candidate text;
  random_value bigint;
  allocated boolean;
  repaired integer := 0;
begin
  if exists (
    select 1 from public.students
    where access_code ~ '^[0-9]{7}$'
    group by access_code having count(*) > 1
  ) then
    raise exception 'Duplicate valid access codes require a separate review; no changes were made.';
  end if;

  for student_row in
    select id from public.students
    where access_code is null or access_code !~ '^[0-9]{7}$'
    order by id
  loop
    allocated := false;
    for attempt in 1..1000 loop
      -- Use 32 random bits from a v4 UUID. Reject the incomplete modulo range.
      random_value := ('x' || substr(gen_random_uuid()::text, 1, 8))::bit(32)::bigint;
      if random_value >= 4290000000 then
        continue;
      end if;
      candidate := lpad((random_value % 10000000)::text, 7, '0');
      if not exists (select 1 from public.students where access_code = candidate) then
        update public.students set access_code = candidate where id = student_row.id;
        allocated := true;
        repaired := repaired + 1;
        exit;
      end if;
    end loop;
    if not allocated then
      raise exception 'Could not allocate a unique code. Entire repair rolled back; retry or investigate code capacity.';
    end if;
  end loop;
  raise notice 'Assigned fresh access codes to % students.', repaired;
end $$;
commit;

-- Should return 0. Retrieve the new codes through the teacher dashboard after deployment.
select count(*) as students_still_missing_valid_codes
from public.students
where access_code is null or access_code !~ '^[0-9]{7}$';
