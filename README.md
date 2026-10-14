# Axiom

A React + TypeScript + Vite classroom portal. Teachers sign in with Supabase
Auth; students use a unique seven-digit access code and never need an Auth
account, email, username, password, or profile.

## Local development

Use Node 22.18+ (native TypeScript tests) and Deno 2 for server checks.

```sh
npm ci
cp .env.example .env.local
# Set the project's public Supabase URL and anon/publishable key.
npm run dev
```

Only public credentials belong in `VITE_*` variables. The service-role key is
read exclusively inside Edge Functions from Supabase's server environment.

```sh
npm run build
npm run lint
npm test
npm run test:server
deno check --no-config --node-modules-dir=manual supabase/functions/axiom-api/index.ts supabase/functions/student-login/index.ts supabase/functions/create-student/index.ts supabase/functions/delete-student/index.ts
```

## Architecture

- `src/domain/types.ts`: provider-independent student, teacher, grade,
  assessment, and session types.
- `src/services/index.ts`: small auth, student, and grade services consumed by
  React.
- `src/services/providers/supabaseProvider.ts`: Supabase authentication, profile
  reads, and function calls. Replace this module when moving providers.
- `src/services/studentSession.ts`: safe browser persistence and removal of
  legacy identity-only sessions.
- `src/contexts/`: shared teacher/student state, session expiry, and logout.
- `src/pages/`: existing Home, Login, Teacher, Grades, and Axiom pages.
- `supabase/functions/`: server-side teacher authorization, student token
  verification, and CRUD.
- `supabase/migrations/`: additive assessment/session data and classroom access
  restrictions.

The roster remains shared by all teachers, matching the original app.
Subject/class filters organize the roster; per-teacher or school ownership is
not implemented. Overall grades are entered independently of assessments; no
weighting or automatic calculations are performed. Axiom's learning page remains
a coming-soon page.

## Deployment — required before using the new classroom features

The repository originally had no database schema, function source, linked
Supabase project, or deployment tooling. The supplied migration assumes the
existing tables match the frontend:
`students(id uuid, name, subject, section, access_code)`,
`grades(student_id uuid, grade)`, and `profiles(id uuid, role)`. Existing extra
columns must either be nullable or have defaults. In particular, remove any old
requirement for a student Auth user/profile ID before using the new student
creation function. Do not delete existing teacher profiles or Auth accounts.

**Do not deploy the new frontend alone.** It requires the new function responses
and migration. There is deliberately no fallback to unsafe browser-ID-based
grade reads. Existing students must sign in again after upgrading.

1. Export/back up the existing schema, policies, function source, and data. Test
   the migration against a staging copy first. Check for duplicate access codes,
   missing/invalid codes, multiple overall grades per student, grades outside
   0–100, unknown required columns, triggers, and foreign keys. The migration
   aborts on ambiguous existing data; it never silently chooses a grade or
   deletes a student. Resolve those records deliberately first.
   If it stops with "Every existing student must have a valid seven-digit access
   code", run `supabase/scripts/repair_student_access_codes.sql` separately in
   SQL Editor, then retry the migration. The repair assigns unique new codes
   only to missing/malformed values. Existing valid codes, student IDs, and
   grades are preserved. Affected students will need their newly assigned code.
   The script can be rerun safely and returns a remaining-invalid count of zero.
   Duplicate valid codes require separate review.

2. Review `supabase/migrations/202610120001_classroom_mvp.sql`. It preserves the
   original core tables and data, converts access codes to text, adds unique
   constraints, ensures a bigint grade ID has an automatic generator when
   neither an identity nor a default already exists, and creates assessments,
   hashed student sessions, and login rate-limit buckets. It **replaces existing
   RLS policies on the classroom tables and profiles**: browser roles have no
   direct classroom-table access; authenticated teachers can only read their own
   profile ID/role. All management operations go through role-checked functions.
   Account provisioning/role changes must stay server-side. If other consumers
   depend on the old policies, adapt them before applying the migration.
3. With the official Supabase CLI installed and signed in, link the intended
   project and apply the migration:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   If the project has existing remote migration history, reconcile it first
   using the CLI's migration workflow. Alternatively, run the reviewed SQL once
   through the project's SQL editor. The migration is transactional, not
   designed for repeated manual execution.
4. Deploy the four functions from this repository:

   ```sh
   supabase functions deploy axiom-api
   supabase functions deploy student-login
   supabase functions deploy create-student
   supabase functions deploy delete-student
   ```

   `supabase/config.toml` disables gateway JWT checking because students use
   Axiom tokens. Every teacher operation still verifies the supplied JWT through
   `auth.getUser()` and checks the server-side profile role. `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are provided by hosted Supabase; never add the
   latter to Vercel frontend variables.
5. Deploy the frontend to Vercel with the existing public environment variables.
   `vercel.json` supports refreshing client routes. Coordinate
   schema/functions/frontend during a maintenance window because the old
   student-login response and direct table reads are incompatible with the new
   flow. Redeploy old functions and restore the reviewed schema/policies from
   the backup if rollback is needed; rolling back only the frontend is
   insufficient.
6. Complete the live checks below before opening classroom access.

## Sessions and security

A student login produces a cryptographically random 256-bit bearer token valid
for eight hours. Only its SHA-256 hash, student ID, and expiry are stored
server-side. The browser stores the token and display identity in session
storage. Grade reads resolve the student from that hash and reject
expired/missing tokens; request-supplied student IDs are ignored. Editing
browser identity cannot grant access to another student's grades. Logout clears
local identity immediately and requests server-side token revocation. If
revocation fails because of a network error, local logout still occurs; the
inaccessible server session expires within eight hours. Student deletion revokes
all associated sessions and deletes grades/assessments atomically.

Seven-digit access codes remain bearer credentials and should be shared
privately. Login is limited to 30 attempts per gateway-provided client address
per ten minutes; a shared school network may hit that limit. Tokens in session
storage still require protection against XSS. Cookie sessions or richer
authentication can be introduced later without changing the page/service
boundary.

Teacher authorization uses the existing Supabase teacher profile; teacher roles
cannot be assigned through browser writes. New students only create `students`
rows. Legacy student Auth accounts, if present remotely, are left intact pending
a separate reviewed cleanup.

## School Excel/CSV student rosters

Use **Import Excel or CSV** to upload `.xlsx`, `.xls`, or `.csv` directly.
Recognized name headers include `English`, `English Name`, `姓名`, `Chinese
Name`, and `Student Name` / `Name`. Headers can follow title rows; repeated
headers and blank-name rows are ignored. A single English or Chinese column
is supported. Combined names are split only at clear Latin/Han script
boundaries (including names in either order or with matching parentheses).
Ambiguous cells remain invalid until corrected or removed in the preview.
Unrelated columns are discarded. A two-column CSV template remains available.

When headers are missing or incomplete, deterministic local analysis scores
columns using Latin/Han name patterns, distinct values, and the proportion of
name-like cells. Numeric IDs, dates, gender, contacts, and labeled parent/pinyin
columns are excluded. Common pinyin surname spellings are compared with Chinese
names to avoid treating pinyin as English names. Title, blank, repeated-header,
and recognizable summary rows are skipped. No AI API or external analysis is used.

Competing name-like columns or insufficient evidence require confirmation;
no students are previewed or imported automatically in that case. Expand
**Check or change name columns and starting row**, select Excel column letters
and the first student row, then choose **Update preview**. These controls also
correct an automatic selection. Known non-name columns are disabled, and only
generic column letters are shown—not unrelated headers or cell contents.
Headerless student and parent names can have identical patterns; deterministic
analysis cannot guarantee their identity. Review the selected names before
importing. Single-row headerless files require manual selection.

With multiple visible worksheets, choose one before previewing or importing;
sheets are never merged automatically. Hidden sheets are excluded. Empty or
unrecognized worksheets show a clear error. Invalid, renamed, and unsupported
password-protected files are rejected without echoing file contents. Limits
are 20 worksheets, 10,000 source rows / 256 columns per sheet, and 1,000 named
students per sheet, within a 2 MB file. CSV supports UTF-8 and UTF-16 BOM plus
comma, semicolon, and tab delimiters.

Choose or enter **Subject** and **Class / Section** once for the whole roster;
suggestions reuse the existing roster's subjects and sections. With
**Include Chinese names** enabled, the display name is `English 中文`; with it
disabled, only the English name is used. A missing English name falls back to
Chinese in either mode. Rows with both names missing are ignored. Names,
subjects, and sections use the existing 120-character validation. Files can
contain up to 1,000 named students and be at most 2 MB.

Files are parsed locally in the browser. Only extracted names are retained in
preview state; original workbook/CSV cells exist only temporarily during
parsing. A local File reference is kept while the preview is open so changing
column selections can re-read the file; closing the preview releases it.
School IDs, roster numbers, pinyin, sex, birth dates, and parent
contact details are not retained, previewed, uploaded, logged, or exported.
The preview shows display name, subject, class/section, and validation status.
Name fields are editable and rows can be removed before confirmation; these
actions change only the local preview. Once import starts, edits, removal, and
worksheet/column selection are locked to preserve safe retry payloads. Changing
columns clears the old preview until it is re-read, preventing stale imports.
Outbound import requests use an explicit field allowlist: generated
Axiom row IDs, display names, chosen class fields, and identity confirmation.
The original file is never uploaded. Excel parsing is lazy-loaded using
SheetJS CE 0.20.3 from its official distribution (not the older npm-registry
release), with legacy XLS codepage support; parser errors shown to users omit file contents.

Repeated names and English/bilingual display variants trigger identity
warnings. Leave a row skipped if it represents an existing student. Confirm
**This is a different student** only when creating a separate person with the
same name. Names are not unique identifiers. The server also checks display
variants, so changing the Chinese-name checkbox alone does not silently create
another account. Existing records, grades, and access codes are never changed.
Use the existing **Edit Class** action for assignment changes; the current
model still supports one subject/section assignment per student.

Imports reuse manual creation's cryptographic seven-digit code generator,
unique-code constraint, server authorization, and collision retries. The
existing full-record deterministic retry key and frozen random IDs for
explicitly distinct students remain unchanged. Retry failed/unconfirmed rows
from the same preview. Batches of 25 show progress and can stop after the
current batch; completed inserts are retained, and failures are reported.

**Export Students** continues to export the entire roster or current class
filters, using server authorization and pagination. Exports contain Axiom's
own UUIDs, display names, subjects, and sections—not school IDs, ignored
metadata, access codes, passwords, grades, or tokens. UTF-8 BOM, CRLF, CSV
escaping, and Excel formula-injection protection remain in place.

No database migration or RLS changes are required. The import API remains
unchanged; this interface update requires only a frontend deployment. The
previous school import update's `axiom-api` display-name checks must already
be deployed. Teacher authorization remains the current single-teacher model;
per-teacher ownership is still deferred, as agreed. Tests use synthetic school data and an XLSX fixture to check
that ignored fields never reach application requests, database writes, exports,
or logs. Live student data is not used for these checks.

## MVP navigation

The homepage (`/`) uses the existing student access-code and teacher
email/password login forms. After session restoration, signed-in students go
to `/grades` and teachers with a teacher profile go to `/teacher`. The old
`/login` URL redirects to `/` for compatibility. Protected routes send visitors
back to `/` and keep the existing role checks.

The header retains Grades, the teacher-only Teacher link, branding, and the
persisted theme toggle. Logout appears for a restored teacher or student
session and returns to `/`. Home and the Axiom arcade are outside the active
route tree; their source components remain available for future development,
including the coming-soon page. `/axiom` currently follows the fallback to `/`,
so its Learn More button is outside the MVP experience.

## Verification status and live checklist

Automated checks cover session persistence/logout, rejection of
old/malformed/expired storage, code and grade validation, assessment score/date
validation, random token hashing, and mocked Edge Function authorization. Server
tests verify that a forged browser student ID cannot change the identity used
for reads, ID-only requests are rejected, students cannot run teacher
operations, invalid codes are rejected, rate limits block login, logout deletes
hashed tokens, and student creation never invokes Auth account creation.

These tests mock database HTTP responses. They do not prove live RLS, SQL
compatibility, actual Auth delivery, clipboard behavior, or production
deployment. No migration or function deployment was performed as part of local
implementation.

In a staging project, verify:

- Teacher email/password login and logout; refresh `/teacher`; students/visitors
  rejected from teacher routes and API actions.
- Create a student; ensure a unique seven-digit code and no Auth/profile row;
  retrieve/copy that code.
- Filter students by subject/class; edit class; save grades including 0 and 100;
  reject blanks/out-of-range grades.
- Create, edit, and delete assessments; verify percentages and empty states in
  the student view.
- Log in with valid/invalid codes; verify fresh student name/class/overall
  grade; refresh `/grades`.
- With student A's token, change browser/request `studentId` to student B: only
  A's data must be returned. Attempt direct anon table reads: no data must be
  returned. Attempt grade reads with no token, an expired/revoked token, or only
  an ID: must be rejected.
- Log out and revisit `/grades`; old identity must not appear. Delete a student
  and verify their session and grade access is revoked.
- Check desktop/tablet/phone layouts, horizontal student-table scrolling, mobile
  student-first login panels, visible mobile navigation, and both themes.

Security references:
[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security),
and
[Edge Function authentication](https://supabase.com/docs/guides/functions/auth).
