# Backend setup and deployment

Configure Supabase before running classroom workflows, then deploy the database, Edge Functions, and frontend in that order. Review migration history and test changes in staging before applying them to classroom data.

## Supabase prerequisites

The migrations extend an existing database rather than creating the original classroom tables. Verify that the base tables contain these columns:

| Table | Required base columns |
| --- | --- |
| `students` | `id` (UUID), `name`, `subject`, `section`, `access_code` |
| `grades` | `student_id` (UUID), `grade` |
| `profiles` | `id` (UUID matching an Auth user), `role` |

Additional required columns must have defaults or permit null values. Remove legacy requirements for a student Auth user/profile ID before using student creation. Preserve existing teacher profiles and Auth accounts. Provision a teacher through privileged administration, with a matching profile whose role is `teacher`.

Use the Supabase CLI for migration and function deployment. Configure the frontend with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from [`.env.example`](../.env.example). Hosted Edge Functions receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase; never copy the service-role key into frontend or Vercel build variables.

## Review and apply migrations

Back up the schema, policies, function source, and data before modifying an existing project. Check for duplicate or malformed access codes, multiple overall grades per student, grades outside 0–100, additional required columns, triggers, and foreign keys. Resolve ambiguous records deliberately; the original migration stops rather than discarding them.

Apply pending migrations in filename order:

| Migration | Changes and compatibility considerations |
| --- | --- |
| [`202610120001_classroom_mvp.sql`](../supabase/migrations/202610120001_classroom_mvp.sql) | Preserves core rows; converts access codes to text; adds uniqueness and validation constraints, individual assessments, hashed sessions, and the original limiter. Adds automatic IDs when an existing bigint grade ID has neither an identity nor a default. Replaces classroom/profile row-level security policies. |
| [`202610150001_tests_quizzes.sql`](../supabase/migrations/202610150001_tests_quizzes.sql) | Adds class tests/quizzes, scores, and transactional functions with revision checks. Preserves existing assessments, grades, codes, policies, and sessions. |
| [`202610150002_browser_login_limits.sql`](../supabase/migrations/202610150002_browser_login_limits.sql) | Adds the browser limiter and atomic login function; removes the original limiter and its address-derived hashes. Requires the coordinated rollout below. |

The first migration removes existing permissive policies. If other applications depend on those policies, review their compatibility before proceeding. See [authentication and security](authentication.md#database-access-and-secrets) for the resulting access model.

If the initial migration reports invalid seven-digit codes, review and run [`repair_student_access_codes.sql`](../supabase/scripts/repair_student_access_codes.sql) separately in the SQL editor. It assigns unique replacements only to missing or malformed codes, preserving valid codes, student IDs, and grades. It can be rerun and reports the remaining-invalid count; duplicate valid codes require separate review. Give affected students their replacement codes.

After confirming the intended project and its migration history, link and apply pending migrations:

```sh
supabase login
supabase link --project-ref your_project_ref
supabase db push
```

If SQL was applied manually, reconcile the CLI's migration history before pushing. Do not replay completed migrations. Alternatively, apply reviewed pending SQL once through the project's SQL editor; these transactional migrations are not scripts for repeated manual execution.

Run the applicable [database tests](testing.md#database-scenarios) in staging before applying the reviewed changes to production.

## Deploy Edge Functions

Deploy the four function entry points after the database is compatible:

```sh
supabase functions deploy axiom-api
supabase functions deploy student-login
supabase functions deploy create-student
supabase functions deploy delete-student
```

Use the checked-in function configuration and [server authorization model](authentication.md). The frontend expects the current function response shapes; there is no fallback to browser-supplied student IDs for grade access. Name edits and roster imports also depend on the corresponding `axiom-api` operations.

Access-code resets require the updated `axiom-api` function before the matching frontend. They use the existing student table and unique-code constraint; no additional database migration is required for resets.

## Roll out browser login limits

The browser-limit migration and both login-capable functions were deployed to the linked Axiom project on October 15, 2026. For other environments, confirm migration history and follow the coordinated rollout below.

Coordinate this change during a maintenance window:

1. Apply the browser-limit migration in staging and run its SQL scenarios. Verify simultaneous requests through both login endpoints using separate database connections; an embedded, serial database check does not verify that concurrency behavior.
2. Apply the reviewed migration to production. Old login functions fail closed once the migration removes their limiter.
3. Deploy both `student-login` and `axiom-api`, then the frontend. Refresh existing login tabs so they send the required browser identifier. Existing student sessions remain valid.
4. Schedule the cleanup function below daily in a privileged maintenance job. The migration creates the helper but does not schedule it.

The maintenance call removes inactive browser buckets older than one day and expired sessions, while retaining active cooldowns:

```sql
select public.axiom_cleanup_student_login_limits();
```

## Deploy the frontend

Set the two public Supabase variables in the Vercel project's production environment. Install the Vercel CLI, authenticate, link the intended existing project, and deploy:

```sh
npm i -g vercel
vercel login
vercel link
vercel --prod
```

[`vercel.json`](../vercel.json) rewrites client routes to `index.html` so direct visits and refreshes work. Complete the [staging and release checks](testing.md#staging-and-release-checks) before opening classroom access.

Coordinate rollback across affected schema, policies, functions, and frontend versions. The original authentication upgrade invalidates legacy identity-only sessions and requires students to sign in again. Rolling back only its frontend is insufficient; retain reviewed backups and the matching prior function source. The later browser-limit migration preserves existing student sessions.

## Enable Web Analytics

[`MainLayout.tsx`](../src/layouts/MainLayout/MainLayout.tsx) mounts `@vercel/analytics/react` once across application routes. Development uses the package's debug mode; Vercel deployments collect page views when analytics is enabled.

Enable **Web Analytics** in the Vercel project's **Analytics** tab before deploying. Visit the production site, then confirm visitors and page views appear in that tab. See [Vercel's setup guide](https://vercel.com/docs/analytics/quickstart) for platform details.
