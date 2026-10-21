# Customer Inquiry Management

A small customer-support workspace built with React, Express, and PostgreSQL. Signed-in staff share the inquiry inbox and can capture, find, and update customer requests.

## Requirements

- Node.js 20 or newer
- npm
- Docker Desktop (or another Docker Compose installation)

## Run locally

1. Copy `.env.example` to `.env`.
2. Change `JWT_SECRET` to a random string of at least 32 characters. Change the seeded staff password if desired.
3. Install dependencies: `npm install`.
4. Start PostgreSQL: `docker compose up -d database`.
5. Apply schema migrations: `npm run db:migrate --workspace server`.
6. Create/update the local staff account: `npm run db:seed --workspace server`.
7. Start the API and frontend: `npm run dev`.
8. Open <http://localhost:5173> and sign in with `SEED_STAFF_EMAIL` and `SEED_STAFF_PASSWORD` from `.env`.

The API runs on port 4000 and PostgreSQL on port 5432. Set `VITE_API_URL` in a local `.env` if the API is hosted at a different URL. The health endpoint is `/api/health`.

The default local demo account is `staff@example.com` with password `local-demo-password-change-me`; both values come from `.env.example` and can be changed before running the seed command. The values in `.env.example` are for local development only. Do not use its sample password or JWT secret in a deployed environment. The seed command hashes the configured password and does not store the plaintext password.

## Database and API

- SQL migrations are in `server/migrations`; the runner records applied migrations in `schema_migrations` and is safe to run again.
- Inquiries store customer name, contact details, subject, description, status, creator, and timestamps.
- Every active signed-in staff member can see and update every inquiry. The API enforces sign-in for all inquiry routes.
- The API validates required fields and supported statuses independently of the browser. Duplicate submissions are kept as separate inquiries; staff can use search to distinguish them.
- Statuses can move between New, In Progress, and Resolved in either direction. The API compares the record version on updates and returns `409 Conflict` when another tab has already changed it. The interface displays the latest version and asks staff to review it before trying again.

## Tests and build

```powershell
npm test
npm run build
```

The default test command checks backend authentication and validation rules and exercises the frontend sign-in and empty-inbox flow. To run the database-backed API workflow test against your configured local PostgreSQL database, apply migrations and seed the staff account first, then run:

```powershell
$env:RUN_DB_INTEGRATION = "1"
npm run test --workspace server
```

The integration test covers sign-in, persistence, status changes, stale updates, invalid IDs, and missing records. A separate automated browser-level suite is not included.

## Screen recording

Record a 3–5 minute walkthrough showing: sign-in, capturing an inquiry, searching/filtering and opening it, changing its status, and one failure case (for example an invalid sign-in or a stale update). Explain shared staff access and stale-update handling. A screen recording still needs to be captured separately; it is not included in this repository.
