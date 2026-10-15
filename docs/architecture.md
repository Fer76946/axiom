# Architecture

Axiom separates its React interface from Supabase operations through typed services. Server functions enforce teacher permissions and resolve student identity before accessing classroom data.

## Code organization

The main source directories divide the interface, service boundary, domain logic, and backend:

| Location | Responsibility |
| --- | --- |
| [`src/App.tsx`](../src/App.tsx) | Route definitions and shared layout |
| [`src/pages/`](../src/pages/) | Login, teacher dashboard, and student grades views |
| [`src/components/`](../src/components/) | Navigation, roster tools, and assessment interfaces |
| [`src/contexts/`](../src/contexts/) | Authentication state, restoration, expiry, and logout |
| [`src/domain/`](../src/domain/) | Shared types, validation helpers, name analysis, grading, and import/export transformations |
| [`src/services/index.ts`](../src/services/index.ts) | Authentication, student, and grade service interfaces |
| [`src/services/providers/supabaseProvider.ts`](../src/services/providers/supabaseProvider.ts) | Supabase Auth calls, profile reads, and Edge Function requests |
| [`src/services/studentSession.ts`](../src/services/studentSession.ts) | Student session persistence and removal of legacy identity-only storage |
| [`src/services/studentLogin.ts`](../src/services/studentLogin.ts) | Browser identifier persistence and cooldown error type |
| [`supabase/functions/`](../supabase/functions/) | Server authorization and classroom operations |
| [`supabase/migrations/`](../supabase/migrations/) | Database constraints, access restrictions, and transactional operations |

Components consume the service interfaces rather than issuing classroom-table queries. The Supabase provider is the integration point for changing backend implementations.

## Request and data flow

The browser sends classroom operations to four Edge Functions:

| Function | Purpose |
| --- | --- |
| `student-login` | Authenticate a student and issue an opaque session token |
| `axiom-api` | Serve student results and teacher management operations |
| `create-student` | Create a student with a generated access code |
| `delete-student` | Delete a student and their related records |

All four entry points use [`_shared/handler.ts`](../supabase/functions/_shared/handler.ts). Teacher requests carry a Supabase access token; student result requests carry an Axiom session token. See [authentication and security](authentication.md) for the authorization rules.

The database stores classroom data in these tables:

- `students`: names, subject/class assignments, and access codes
- `profiles`: teacher roles linked to Supabase Auth identities
- `grades`: one overall grade per student
- `assessments`: individual student results
- `tests_quizzes` and `test_quiz_scores`: class assessments and saved scores
- `student_sessions` and `student_login_limits`: student authentication state

## Routes and navigation

React Router defines the active navigation:

| Route | Behavior |
| --- | --- |
| `/` | Student and teacher sign-in; restored sessions redirect to their dashboard |
| `/grades` | Student results, requiring a student session |
| `/teacher` | Teacher dashboard, requiring a teacher profile |
| `/login` | Compatibility redirect to `/` |
| Other paths | Redirect to `/` |

The shared header includes Grades, a teacher-only Teacher link, a persisted theme toggle, and login/logout controls. Home and Axiom arcade components remain in the repository but are outside the active route tree; `/axiom` currently redirects to `/`.

## Current scope

The classroom model has these limits:

- Verified teachers share the roster. Per-teacher and per-school ownership are not implemented.
- Each student has one subject/class assignment.
- Teachers enter overall grades independently of assessment scores. There is no automatic weighting or aggregation.
- The learning and arcade pages are outside the active application experience.

See [student management](student-management.md) for supported classroom workflows and [testing](testing.md) for verification coverage.
