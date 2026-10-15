# Testing and verification

Axiom has client/domain tests, mocked Edge Function tests, and database scenarios. Run the automated checks locally, then validate authorization and classroom workflows in staging before release.

## Local checks

Use Node.js 22.18+ for native TypeScript tests and Deno 2 for server checks. Install project dependencies with `npm ci` before running:

```sh
npm run build
npm run lint
npm test
npm run test:server
```

Type-check the four Edge Function entry points with Deno:

```sh
deno check --no-config --node-modules-dir=manual \
  supabase/functions/axiom-api/index.ts \
  supabase/functions/student-login/index.ts \
  supabase/functions/create-student/index.ts \
  supabase/functions/delete-student/index.ts
```

The suites cover these boundaries:

| Suite | Coverage |
| --- | --- |
| [`tests/`](../tests/) | Session storage/expiry, browser identifier persistence, validation, bilingual names, roster parsing, CSV export, and score-entry transformations |
| [`handler_test.ts`](../supabase/functions/_shared/handler_test.ts) | Mocked authorization and database requests, student token identity, both login entry points, cooldown metadata, malformed requests, infrastructure failures, import retries, exports, and assessment operations |
| [`supabase/tests/`](../supabase/tests/) | PostgreSQL constraints, privileged functions, transactional behavior, and login-limit timing scenarios |

Import tests use synthetic data and an XLSX fixture. They check that ignored fields do not reach application requests, database writes, exports, or logs.

## Database scenarios

Run SQL scenarios only against a disposable or staging database with the applicable [migrations](deployment.md#review-and-apply-migrations) applied. Connect `psql` to that database as its owner, then execute:

```sh
psql -v ON_ERROR_STOP=1 -f supabase/tests/tests_quizzes_test.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/browser_login_limits_test.sql
```

Both scripts wrap fixture changes in transactions and roll them back. The test/quiz script checks creation retries, zero versus ungraded scores, stale edits, score bounds, and class eligibility. The browser-limit script checks the tenth-failure boundary, rolling expiry, cooldown duration, browser isolation, reset after success, session lifetime, rollback after session-insert failure, grants, and cleanup.

The browser-limit migration and scenarios have also passed in an isolated embedded PostgreSQL runtime. That check used a minimal fixture schema and serial execution; it does not establish compatibility with a hosted database or row-lock behavior across simultaneous connections.

## Staging and release checks

Automated tests do not establish hosted migration state, Auth delivery, actual network behavior, clipboard permissions, browser rendering, or production deployment. Check the relevant workflows against staging:

- **Teacher access**: Sign in and out, refresh `/teacher`, and reject students, visitors, and authenticated non-teachers from teacher APIs.
- **Roster operations**: Create a student with a unique seven-digit code and no Auth/profile row. Copy the code; edit names and class assignments; filter by name, subject, and class. Verify name search matches partial English or Chinese names regardless of capitalization and does not match codes or class fields.
- **Grades and assessments**: Save overall grades of zero and 100; reject invalid values. Create, edit, and delete individual results and class tests/quizzes. Check blank versus zero scores, retained results after class changes, and stale-edit rejection.
- **Imports and exports**: Review name columns and worksheets, correct ambiguous names, confirm genuinely distinct students, and retry interrupted batches. Confirm exports follow only their documented [subject/class scope](student-management.md#export-rosters) and exclude credentials and ignored school fields.
- **Student access**: Authenticate with valid and invalid codes, refresh `/grades`, and verify the current name, class, overall grade, and results.
- **Isolation**: With student A's token, submit student B's ID and confirm that only A's results return. Reject requests with no token, expired/revoked tokens, or an ID alone. Confirm direct `anon` classroom-table reads return no data.
- **Logout and deletion**: Revisit `/grades` after logout; the previous identity must not appear. Delete a test student and confirm their sessions and result access are revoked.
- **Browser login limits**: Verify ten failures trigger five minutes of cooldown; requests during cooldown do not extend it. Confirm success resets failures and expiry restores the failure budget. Test refreshes, separate tabs, independent browsers, and correct codes during cooldown.
- **Concurrency and failure handling**: Send parallel requests for one browser identifier through both login endpoints. Confirm serialized counting and no extra sessions during cooldown. Change IP headers without changing the identifier and confirm the bucket stays the same. Simulate a database outage and confirm login fails closed.
- **Interface**: Check desktop, tablet, and phone layouts, table scrolling, student-first mobile login, navigation, keyboard focus, reduced motion, and both themes.

See [deployment](deployment.md) for release ordering and the remaining browser-limit rollout steps.
