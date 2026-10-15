# Axiom

Axiom is a classroom portal for managing student rosters, recording grades, and sharing assessment results. Teachers manage their classes through a dashboard; students view their own results using a seven-digit access code, without creating an account.

## Features

- Student management with name search, subject/class filters, and bilingual name display
- Excel and CSV roster imports with editable previews and duplicate-name review
- Class tests and quizzes, individual assessment results, and overall grades
- Separate teacher and student authentication with server-side authorization
- Responsive layouts, light and dark themes, and Vercel Web Analytics

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, CSS |
| Backend | Supabase Auth, PostgreSQL, Supabase Edge Functions (Deno) |
| Spreadsheet processing | SheetJS Community Edition |
| Hosting and analytics | Vercel, Vercel Web Analytics |
| Quality checks | ESLint, TypeScript, Node and Deno tests, SQL scenarios |

## Run locally

Use Node.js 22.18+ and npm. Backend checks also require Deno 2. The application needs a Supabase project with the expected schema, deployed Edge Functions, and a provisioned teacher account; follow the [backend setup and deployment guide](docs/deployment.md) first if you do not have one.

Install dependencies and create the local environment file:

```sh
npm ci
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` to your project's URL and public anon or publishable key. Never put a service-role key in frontend variables.

Start the development server and open the local URL Vite prints:

```sh
npm run dev
```

## Check the project

Run the build, lint checks, and client-side tests:

```sh
npm run build
npm run lint
npm test
```

See the [testing guide](docs/testing.md) for server tests, database scenarios, and staging checks.

## Documentation

- [Architecture](docs/architecture.md): code organization, data flow, routes, and current scope
- [Authentication and security](docs/authentication.md): teacher authorization, student sessions, and browser login limits
- [Student management](docs/student-management.md): roster workflows, imports, exports, and assessments
- [Backend setup and deployment](docs/deployment.md): Supabase prerequisites, migrations, release order, and analytics

The documentation describes the current source tree. See the deployment guide for rollout requirements before enabling changes in a hosted environment.
