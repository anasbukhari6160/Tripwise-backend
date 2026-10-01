import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// All providers and database operations below use local test fixtures.
Object.assign(process.env, {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  SESSION_SECRET: "test-only-session-secret-with-32-characters",
  FRONTEND_URL: "https://frontend.example.com/",
  GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
  RESEND_API_KEY: "test-only-resend-key",
  EMAIL_FROM: "TripWise <test@example.com>",
  EMAIL_MODE: "resend",
  STRIPE_SECRET_KEY: "test-only-stripe-key",
  STRIPE_WEBHOOK_SECRET: "test-only-webhook-secret",
});
const { default: pool } = await import("../src/config/db.js");
const { default: stripe } = await import("../src/config/stripe.js");
const { OAuth2Client } = await import("google-auth-library");
const { default: bcrypt } = await import("bcrypt");
const sessions = new Map();
const rateLimits = new Map();
let user;
let databaseFailure = false;
let providerFailure = false;
let latestEmail;
let updatedSubscription;
const passwordHash = await bcrypt.hash("test-password", 10);
const originalQuery = pool.query;
pool.query = async (query, values = []) => {
  if (databaseFailure) throw Object.assign(new Error("private database detail"), { code: "TEST_DB_FAILURE" });
  const sql = query.replace(/\s+/g, " ").trim();
  if (sql.includes("to_regclass")) return { rows: [{ to_regclass: "user_sessions" }] };
  if (sql.includes("auth_rate_limits")) {
    if (sql.startsWith("INSERT INTO auth_rate_limits")) {
      const [key, windowMs] = values;
      const now = Date.now();
      const existing = rateLimits.get(key);
      const expired = !existing || existing.resetAt <= now;
      const entry = {
        totalHits: expired ? 1 : existing.totalHits + 1,
        resetAt: expired ? now + Number(windowMs) : existing.resetAt,
      };
      rateLimits.set(key, entry);
      return { rows: [{ total_hits: entry.totalHits, reset_at: new Date(entry.resetAt) }], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE auth_rate_limits")) {
      const entry = rateLimits.get(values[0]);
      if (entry) entry.totalHits = Math.max(entry.totalHits - 1, 0);
      return { rowCount: 1 };
    }
    if (sql.startsWith("DELETE FROM auth_rate_limits")) {
      const removed = rateLimits.delete(values[0]);
      return { rowCount: removed ? 1 : 0 };
    }
    return { rowCount: 0 };
  }
  if (sql.includes('"user_sessions"')) {
    if (sql.startsWith("INSERT")) sessions.set(values[2], JSON.parse(JSON.stringify(values[0])));
    if (sql.startsWith("DELETE")) sessions.delete(values[0]);
    return { rows: sql.startsWith("SELECT") && sessions.has(values[0]) ? [{ sess: sessions.get(values[0]) }] : [] };
  }
  if (sql.startsWith("SELECT")) return { rows: user ? [{ ...user }] : [] };
  if (sql.startsWith("INSERT INTO users")) {
    user = { id: 1, name: values[0], email: values[1], password_hash: values[2],
      verification_code_hash: values[3], verification_expires_at: values[4], is_verified: false };
    return { rows: [{ ...user }], rowCount: 1 };
  }
  if (sql.includes("SET verification_code_hash = $1")) {
    if (values.length === 3 || user.verification_code_hash === values[3]) {
      user.verification_code_hash = values[0]; user.verification_expires_at = values[1];
    }
  }
  if (sql.includes("SET password_reset_code_hash = $1")) {
    if (values.length === 3 || user.password_reset_code_hash === values[3]) {
      user.password_reset_code_hash = values[0]; user.password_reset_expires_at = values[1];
    }
  }
  if (sql.includes("SET is_verified = TRUE")) {
    user.is_verified = true; user.verification_code_hash = null; user.verification_expires_at = null;
  }
  if (sql.includes("SET password_hash = $1")) {
    user.password_hash = values[0]; user.password_reset_code_hash = null; user.password_reset_expires_at = null;
  }
  if (sql.includes("SET plan = $1")) updatedSubscription = values;
  return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("https://api.resend.com/")) {
    assert.ok(options.signal instanceof AbortSignal);
    latestEmail = JSON.parse(options.body);
    return Response.json(providerFailure ? { name: "validation_error", message: "private provider detail" } : { id: "test-email" }, { status: providerFailure ? 422 : 200 });
  }
  return originalFetch(url, options);
};
const { default: app, sessionStore } = await import("../src/app.js");
let server;
let base;
before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  sessionStore.close();
  await new Promise((resolve) => server.close(resolve));
  pool.query = originalQuery;
  globalThis.fetch = originalFetch;
  await pool.end();
});
function request(path, body, headers = {}) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("production CORS, preflight, health, JSON errors and anonymous session", async () => {
  const preflight = await fetch(base + "/api/auth/login", {
    method: "OPTIONS",
    headers: { Origin: "https://frontend.example.com", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://frontend.example.com");
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  assert.equal((await request("/api/health", undefined, { Origin: "https://other.example.com" })).status, 403);
  databaseFailure = true;
  assert.equal((await request("/api/health")).status, 200);
  databaseFailure = false;
  assert.equal((await request("/api/auth/me")).status, 401);
  const invalid = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).message, "Invalid request.");
});

test("password login persists PostgreSQL sessions, restores /me, and logout clears matching cookie", async () => {
  user = { id: 1, name: "Test", email: "test@gmail.com", is_verified: true, password_hash: passwordHash };
  const login = await request("/api/auth/login", { email: " TEST@gmail.com ", password: "test-password" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /^tripwise\.sid=/);
  for (const option of ["HttpOnly", "Secure", "SameSite=None", "Path=/"]) assert.ok(cookie.includes(option));
  assert.equal((await login.json()).user.password_hash, undefined);
  const restored = await request("/api/auth/me", undefined, { Cookie: cookie.split(";")[0] });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).user.id, 1);
  const logout = await request("/api/auth/logout", {}, { Cookie: cookie.split(";")[0] });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /^tripwise\.sid=;/);
  assert.match(logout.headers.get("set-cookie"), /SameSite=None/);
  assert.equal((await request("/api/auth/me", undefined, { Cookie: cookie.split(";")[0] })).status, 401);
  user.password_hash = null;
  assert.equal((await request("/api/auth/login", { email: user.email, password: "anything" })).status, 401);
});

test("Google rejection is distinct from database failure and successful Google login restores session", async () => {
  const original = OAuth2Client.prototype.verifyIdToken;
  try {
    OAuth2Client.prototype.verifyIdToken = async () => { throw new Error("invalid token"); };
    assert.equal((await request("/api/auth/google", { credential: "test-token" })).status, 401);
    OAuth2Client.prototype.verifyIdToken = async ({ audience }) => {
      assert.equal(audience, process.env.GOOGLE_CLIENT_ID);
      return { getPayload: () => ({ sub: "test-google-id", email: "test@gmail.com", email_verified: true }) };
    };
    databaseFailure = true;
    const failed = await request("/api/auth/google", { credential: "test-token" });
    assert.equal(failed.status, 500);
    assert.ok(!(await failed.text()).includes("private database"));
    databaseFailure = false;
    user = { id: 1, email: "test@gmail.com", google_id: "test-google-id", is_verified: true };
    const login = await request("/api/auth/google", { credential: "test-token" });
    assert.equal(login.status, 200);
    assert.equal((await request("/api/auth/me", undefined, { Cookie: login.headers.get("set-cookie").split(";")[0] })).status, 200);
  } finally {
    databaseFailure = false;
    OAuth2Client.prototype.verifyIdToken = original;
  }
});

test("registration keeps account on email failure; resend and reset failures preserve previous codes", async () => {
  user = null; providerFailure = true;
  const registration = await request("/api/auth/register", { name: "Test", email: "test@gmail.com", password: "test-password" });
  assert.equal(registration.status, 502);
  assert.equal((await registration.json()).canResend, true);
  assert.ok(user.password_hash.startsWith("$2"));
  const previous = user.verification_code_hash;
  assert.equal((await request("/api/auth/resend-verification", { email: user.email })).status, 502);
  assert.equal(user.verification_code_hash, previous);
  user.password_reset_code_hash = "previous-test-hash";
  assert.equal((await request("/api/auth/forgot-password", { email: user.email })).status, 502);
  assert.equal(user.password_reset_code_hash, "previous-test-hash");
  providerFailure = false;
  assert.equal((await request("/api/auth/resend-verification", { email: user.email })).status, 200);
  const code = latestEmail.html.match(/verification code is (\d{6})/)[1];
  assert.ok(await bcrypt.compare(code, user.verification_code_hash));
  assert.equal((await request("/api/auth/verify-email", { email: user.email, code })).status, 200);
  assert.equal(user.is_verified, true);
  assert.equal(user.verification_code_hash, null);
  user.password_reset_code_hash = await bcrypt.hash("123456", 10);
  user.password_reset_expires_at = new Date(Date.now() + 60000);
  assert.equal((await request("/api/auth/reset-password", { email: user.email, code: "123456", newPassword: "changed-password" })).status, 200);
  assert.equal(user.password_reset_code_hash, null);
  assert.ok(await bcrypt.compare("changed-password", user.password_hash));
});

test("auth endpoints are rate limited and registration accepts any valid email domain", async () => {
  rateLimits.clear();

  const allowed = await request("/api/auth/register", { name: "Test", email: "someone@icloud.com", password: "test-password" });
  assert.notEqual(allowed.status, 400);

  rateLimits.clear();

  const attempts = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    attempts.push((await request("/api/auth/login", { email: "nobody@example.com", password: "wrong-password" })).status);
  }

  assert.ok(attempts.includes(429), "expected the login limiter to reject repeated attempts");
  assert.equal(attempts.at(-1), 429);
  assert.equal((await request("/api/auth/forgot-password", { email: "nobody@example.com" })).status, 200);
  assert.ok(
    rateLimits.size > 0,
    "expected rate limit counters to be persisted through the database",
  );
});

test("a rate limit counter outage fails open instead of blocking sign-in", async () => {
  rateLimits.clear();
  databaseFailure = true;
  try {
    const response = await request("/api/auth/login", { email: "nobody@example.com", password: "wrong-password" });
    assert.notEqual(response.status, 429);
  } finally {
    databaseFailure = false;
  }
});

test("signed Stripe raw webhook accepts current invoice shape and item billing periods", async () => {
  const original = stripe.subscriptions.retrieve;
  stripe.subscriptions.retrieve = async (id) => {
    assert.equal(id, "sub_test");
    return { id, customer: "cus_test", metadata: { userId: "1" }, status: "active", items: { data: [{ current_period_end: 1800000000 }] } };
  };
  try {
    const payload = JSON.stringify({ type: "invoice.paid", data: { object: { parent: { subscription_details: { subscription: "sub_test" } } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const response = await fetch(base + "/api/payments/webhook", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signature }, body: payload });
    assert.equal(response.status, 200);
    assert.equal(updatedSubscription[4].getTime(), 1800000000000);
    assert.equal((await request("/api/payments/webhook", {})).status, 400);
  } finally {
    stripe.subscriptions.retrieve = original;
  }
});

test("production rejects console email mode and a missing Google audience", async () => {
  process.env.EMAIL_MODE = "console";
  try {
    await assert.rejects(import("../src/config/env.js?invalid-email-mode"), /EMAIL_MODE/);
  } finally {
    process.env.EMAIL_MODE = "resend";
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "";
  try {
    await assert.rejects(import("../src/config/env.js?missing-google-id"), /GOOGLE_CLIENT_ID/);
  } finally {
    process.env.GOOGLE_CLIENT_ID = clientId;
  }
});
