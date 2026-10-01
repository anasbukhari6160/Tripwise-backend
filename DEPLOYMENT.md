# TripWise backend deployment

Use Node.js 24, install with `npm ci`, and start with `npm start` from this repository's root. Railway supplies `PORT`; the server binds to `0.0.0.0`. Set the Railway healthcheck path to `/api/health`.

## Environment

Set these through Railway's environment settings. `.env.example` contains placeholders only. Never copy backend secrets into Vercel variables.

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | Set to `production` on Railway. |
| `PORT` | Supplied by Railway; local fallback is 3000. |
| `DATABASE_URL` | Required. Use the Neon connection string, including its SSL parameters. |
| `SESSION_SECRET` | Required; random secret of at least 32 characters. Keep stable across instances and restarts. |
| `FRONTEND_URL` | Required in production; HTTPS frontend origin, without a path, query, or fragment. |
| `GOOGLE_CLIENT_ID` | Required in production; same Web client ID as frontend `VITE_GOOGLE_CLIENT_ID`. Read through `src/config/env.js` as `env.GOOGLE_CLIENT_ID`; the backend does not read `VITE_GOOGLE_CLIENT_ID`. |
| `EMAIL_MODE` | Optional; defaults to `resend`. Production rejects `console`. Development console mode skips delivery and does not print codes. |
| `RESEND_API_KEY` | Required for Resend mode, including production. |
| `EMAIL_FROM` | Required for Resend mode; verified sender used by verification, reset, password-change, and contact emails. |
| `STRIPE_SECRET_KEY` | Required at startup by the existing payment integration. |
| `STRIPE_PRICE_ID` | Required for checkout. |
| `STRIPE_WEBHOOK_SECRET` | Required for webhook signature verification. |
| `PEXELS_API_KEY` | Required for destination photos. |
| `CONTACT_RECEIVER_EMAIL` | Required for contact email delivery. |
| `GROQ_API_KEY` | Required for AI responses. |
| `GROQ_MODEL` | Optional; defaults to `openai/gpt-oss-20b`. Confirm this model is enabled in your Groq account. |
| `EXA_API_KEY` | Required for factual travel grounding; missing or failed grounding uses the existing unavailable-information response. |

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` are not used by the application. `RESEND_FROM_EMAIL` is no longer used; all senders use `EMAIL_FROM`.

## Database

The pool uses only `DATABASE_URL`; SSL is controlled by that connection string. Do not add `rejectUnauthorized: false`. The currently installed pg version warns about future SSL-mode semantics; no major pg upgrade was made.

`src/db/schema.sql` is the existing schema setup mechanism. Its password-change columns now match columns observed in the connected database. No migration or schema-changing query was executed during the audit. Review the schema before applying it to another database.

### Required one-time production step

Two tables are missing from the current database and must be created before or
at first deploy:

| Table | Missing consequence |
| --- | --- |
| `user_sessions` | `connect-pg-simple` can create this itself, but only if the runtime role holds `CREATE`. Authentication fails on a restricted role. |
| `auth_rate_limits` | **No runtime auto-creation exists.** Without it every limiter fails open and the auth endpoints stay completely unprotected. |

A read-only inspection of the connected database confirmed both tables are
absent and that the configured role is the database owner with `CREATE`
permission, so `connect-pg-simple` would create `user_sessions` by itself.
`auth_rate_limits` would not be created at all.

Run the additive, idempotent migration once, before starting the deploy:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_session_and_rate_limit_tables.sql
```

It contains only `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
statements. It drops, truncates, and rewrites nothing, so it is safe to re-run.
The same statements are also present in `src/db/schema.sql`.

Alternatively, paste these two statements into the Neon SQL editor:

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS IDX_user_sessions_expire ON user_sessions (expire);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  total_hits INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset_at ON auth_rate_limits (reset_at);
```

No live SQL was executed against the production database during this audit.

### Rate limiting behavior

Rate limit counters are kept in PostgreSQL rather than process memory so they survive restarts and are shared by every instance. Expired rows are deleted opportunistically during rejected requests. A counter query failure is logged as `[RATE LIMIT STORE FAILED]` and fails open, so a database problem cannot lock users out of sign-in. Watch for that log line: it means the limiter is not enforcing anything.

Current limits, all keyed per client IP:

| Endpoint | Limit | Window |
| --- | --- | --- |
| `POST /api/auth/register` | 5 | 1 hour |
| `POST /api/auth/login` | 10 | 15 minutes |
| `POST /api/auth/google` | 10 | 15 minutes |
| `POST /api/auth/verify-email` | 10 | 15 minutes |
| `POST /api/auth/reset-password` | 10 | 15 minutes |
| `POST /api/auth/resend-verification` | 3 | 1 hour |
| `POST /api/auth/forgot-password` | 3 | 1 hour |

The email-triggering endpoints are limited per hour rather than per attempt because each allowed request costs a Resend call. `app.set("trust proxy", 1)` makes Express read the client address from `X-Forwarded-Proto`/`X-Forwarded-For`, which Railway sets; without it every request would appear to come from the proxy and share one counter. Raise a limit if legitimate shared-address traffic (office, campus, mobile carrier NAT) is being rejected.

## Provider settings and acceptance checks

1. Set the environment above. The audited local `.env` used the browser-style variable name; it was corrected to `GOOGLE_CLIENT_ID` without changing its existing public value or any secret. Confirm the same name in Railway.
2. Confirm Neon connectivity from Railway, then verify startup logs and `/api/health`. Startup deliberately fails if the database connection check fails.
3. In Google Cloud, configure the Vercel frontend origin under the Web client's authorized JavaScript origins. This implementation uses Google Identity Services ID tokens and needs no OAuth redirect callback or Google client secret.
4. Verify `EMAIL_FROM` with Resend and confirm real verification, resend, password-reset, password-change, and contact delivery.
5. Run `migrations/001_session_and_rate_limit_tables.sql` so `user_sessions` and `auth_rate_limits` exist without relying on runtime `CREATE`. Do this before the first deploy.
6. Configure Stripe's webhook URL as the backend origin plus `/api/payments/webhook`. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Verify the price, key mode, signing secret, and webhook API version. Test checkout, renewal, cancellation, and reactivation.
7. In a browser, verify password and Google sign-in, refresh restoration, logout, protected routes, and account deletion. Production cookies are `Secure`, `HttpOnly`, `SameSite=None`, path `/`, named `tripwise.sid`. The browser must permit the cross-site cookie between the Vercel and Railway domains.
8. Confirm Pexels, Groq, and Exa credentials and account access using the existing application flows.

## Preview deployments

The backend allows exactly one credentialed origin, taken from `FRONTEND_URL`.
Vercel preview deployments get their own hostname per pull request, so Google
sign-in and session cookies will not work there unless you add the specific
preview origin to Google Cloud's authorized JavaScript origins.

Do not solve this by allowing `*.vercel.app` in the backend CORS allowlist. That
would let any Vercel deployment send credentialed requests. If preview sign-in
is needed, either set a separate Railway service with its own `FRONTEND_URL`
pointing at the preview origin, or disable deployment protection on preview and
add the exact, explicit preview hostname only.

`npm test` uses a mocked PostgreSQL pool and mocked providers. It exercises the real Express app and PostgreSQL session adapter; it does not certify live provider credentials or Neon writes.

Database dumps are ignored and were removed from the Git index while local copies were retained. Existing Git history was not rewritten; review prior exposure of those exports separately before sharing the repository.

The Stripe compatibility fix follows the installed SDK types and [Stripe's item billing-period change](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).
