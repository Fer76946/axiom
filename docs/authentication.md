# Authentication and security

Axiom uses Supabase Auth for teachers and seven-digit access codes for students. The server enforces permissions and login limits independently of React route guards.

## Teacher authorization

Teachers sign in with email and password. For every teacher operation, the shared Edge Function handler verifies the Supabase token with `auth.getUser()` and checks that the matching `profiles` row has `role = 'teacher'`.

Teacher accounts and roles require privileged provisioning. Browser clients cannot assign roles. Creating a student creates a `students` row without an Auth account, email, password, or profile. Existing legacy student Auth accounts remain untouched pending a separate cleanup.

## Student access codes and sessions

Student credentials and sessions have separate lifecycles:

1. The student submits a seven-digit code as text, preserving leading zeroes. New codes use cryptographic randomness, a unique database constraint, and collision retries.
2. Successful login issues a random 256-bit bearer token valid for eight hours. The database stores its SHA-256 hash, student ID, expiry, and creation timestamp.
3. The browser stores the raw token and display identity in `sessionStorage`.
4. Result requests resolve the student from the token hash. Missing, expired, or revoked tokens are rejected; request-supplied student IDs cannot select another student's results.

Logout clears the local session immediately and requests server-side token revocation. If revocation fails, the server session remains valid until expiry, although the application has discarded its local copy. Student deletion revokes associated sessions and removes related grade and assessment data transactionally.

Access codes are bearer credentials: anyone who knows a valid code can use it. Share them privately. Tokens in browser storage also require protection against cross-site scripting. Legacy identity-only browser storage cannot authorize access.

Verified teachers can reset a student's code through `resetStudentAccessCode`. The server generates the replacement, enforces a change from the current code, and retries uniqueness conflicts. Resetting changes only the code; existing authenticated sessions remain valid until logout or expiry. The teacher interface hides code text until clicked. This is visual masking, not an additional authorization boundary: authorized teacher responses still contain the code for reveal and copy actions.

## Browser login limits

The current source implements limits by browser identifier, with these rules:

| Rule | Behavior |
| --- | --- |
| Identifier | Random UUID in `localStorage`, shared across tabs of the same origin and retained across logout and refreshes |
| Server storage | Hash of the identifier; no student ID or access code in the bucket |
| Failure window | Ten unsuccessful attempts in a rolling ten minutes |
| Cooldown | The tenth failure immediately starts a five-minute cooldown |
| Blocked requests | Rejected before code lookup, including correct codes; do not extend cooldown |
| Reset | Successful authentication clears failures; cooldown expiry grants a fresh budget |
| Account impact | No permanent account lock or access-code change |

Both `student-login` and `axiom-api`'s `studentLogin` action call `axiom_student_login`. PostgreSQL locks the browser row and handles the limit check, code lookup, failure recording, and session creation in one transaction. Logical authentication failures return normally so the counter update commits; database failures roll back and fail closed.

Missing or malformed browser identifiers are rejected. Browser storage must be available. Malformed codes reaching the server count as failed attempts; infrastructure failures return a generic HTTP 503 without counting as incorrect guesses.

Failed authentication uses a generic message that does not reveal whether a code exists. Cooldowns return HTTP 429 with `Retry-After` and `retryAfterSeconds`; React uses that metadata for its countdown. Refreshing the page clears the displayed countdown but the server still enforces the existing identifier's cooldown.

Application login limiting does not read, store, or use IP addresses or device fingerprints. Students sharing one browser identifier share its temporary cooldown; different browser identifiers remain independent on the same network.

### Limits of browser identifiers

The identifier limits attempts per supplied UUID, not per physical person or device. Deleting storage, using private browsing, or sending fresh identifiers can create new buckets. Signing identifiers alone would not prevent automated creation of new ones.

If abuse warrants another layer, consider server-verified, short-lived, single-use proof-of-work challenges for all attempts, including attempts with new identifiers. That mechanism is not implemented. Account-specific lockouts and low global limits could deny access to legitimate classrooms.

See [deployment](deployment.md#roll-out-browser-login-limits) for migration ordering and cleanup scheduling. A deployment without that migration and the updated functions does not use this browser limiter.

## Database access and secrets

Row-level security and database grants restrict direct browser access:

- Browser roles have no direct access to classroom, session, or limiter tables.
- Authenticated teachers can read their own profile ID and role.
- Edge Functions use service-role privileges only after the relevant teacher or student checks.
- Privileged database functions are executable by the service role, not `anon` or `authenticated`.

[`supabase/config.toml`](../supabase/config.toml) sets `verify_jwt = false` for the four functions because student sessions are not Supabase JWTs. The handlers still validate teacher tokens explicitly; disabling gateway checking does not grant teacher privileges.

Only public Supabase credentials belong in frontend `VITE_*` variables. Keep `SUPABASE_SERVICE_ROLE_KEY` inside the server environment. Do not log access codes, session tokens, browser identifiers, or IP addresses in application authentication code. Infrastructure providers' request-log retention is configured separately.

## Security references

Supabase documents the underlying authentication and access-control mechanisms:

- [Verify users with `getUser`](https://supabase.com/docs/reference/javascript/auth-getuser)
- [PostgreSQL row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
