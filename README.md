# Customer Inquiry Management

Starter foundation for a customer inquiry workflow using React, Express, and PostgreSQL.

## Requirements

- Node.js 20 or newer
- npm
- Docker Desktop (or another Docker Compose installation)

## Run locally

1. Copy `.env.example` to `.env`.
2. Install dependencies: `npm install`.
3. Start PostgreSQL: `docker compose up -d database`.
4. Start the React app and API: `npm run dev`.
5. Open <http://localhost:5173>. The workspace displays whether the API can reach PostgreSQL.

The React app runs on port 5173; the Express API runs on port 4000; PostgreSQL runs on port 5432. The API is available at `/api/health`.

This commit establishes the application foundation. Authentication, inquiry management, database schema/migrations, and tests will be added as the workflow is implemented.
