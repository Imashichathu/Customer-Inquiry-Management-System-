# Design decisions

## Assumptions

- This is an internal staff workspace with seeded accounts, not a customer-facing form.
- Every active staff account can see the shared inbox. Each inquiry still records who created it for accountability.
- Contact details are stored as free text because staff may receive either an email address or phone number.

## Design choices

1. **Backend-enforced sessions and validation.** Passwords are hashed with bcrypt. The API issues a short-lived JWT in an HTTP-only, same-site cookie, and checks the active staff account against PostgreSQL on protected requests. The UI is not the security boundary. The server and PostgreSQL both reject missing or oversized inquiry fields; status values are constrained in both layers.
2. **Small versioned PostgreSQL schema.** SQL migrations create staff and inquiry tables, constraints, indexes, and a migration ledger. Parameterized queries keep user input out of SQL syntax. Database access uses the `pg` connection pool without an ORM so the schema and queries remain visible.
3. **Explicit status and stale-data rules.** Any of the three valid statuses can transition to any other, including reopening a resolved inquiry. A status request includes the version last read; if another tab has already changed it, the API returns `409` with the current inquiry. The UI displays that latest data and does not silently overwrite it.

## Trade-off

Duplicate submissions are allowed rather than attempting fuzzy deduplication: two similar requests may be legitimate, and an automated merge could lose customer context. Search helps staff find related entries. JWT logout clears the browser cookie but does not revoke a copied token; the short eight-hour expiry limits that exposure without introducing a session store.

## Next improvements

Add database-backed API integration tests, rate limiting for sign-in, and a browser test for the stale-update path. The included tests cover API authentication/validation and the frontend sign-in/empty-inbox flow. A 3–5 minute end-to-end screen recording remains to be captured.
