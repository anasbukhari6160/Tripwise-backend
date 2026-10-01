import { rateLimit } from "express-rate-limit";

import pool from "../config/db.js";

// Expired rows are removed opportunistically instead of by a timer, so there
// is no interval to close during shutdown and no query on every request.
const PRUNE_SAMPLE_RATE = 50;

let requestsSinceLastPrune = 0;

/**
 * Rate limit counters kept in PostgreSQL rather than process memory.
 *
 * An in-process store would reset on every deploy and would be counted
 * separately by each Railway instance, which is the same class of problem as
 * an in-memory session store.
 */
class PostgresRateLimitStore {
  constructor(windowMs, name) {
    this.windowMs = windowMs;

    // Counters share one table, so each limiter needs its own key namespace.
    this.name = name;

    this.localKeys = false;
  }

  /**
   * The library hands the store a bare client identifier (the IP by default),
   * so the limiter name has to be added here to keep counters separate.
   */
  keyFor(key) {
    return `auth:${this.name}:${key}`;
  }

  async increment(key) {
    try {
      const result = await pool.query(
        `
          INSERT INTO auth_rate_limits (rate_key, total_hits, reset_at)
          VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
          ON CONFLICT (rate_key) DO UPDATE
            SET total_hits = CASE
                  WHEN auth_rate_limits.reset_at <= NOW() THEN 1
                  ELSE auth_rate_limits.total_hits + 1
                END,
                reset_at = CASE
                  WHEN auth_rate_limits.reset_at <= NOW()
                    THEN NOW() + ($2 * INTERVAL '1 millisecond')
                  ELSE auth_rate_limits.reset_at
                END
            RETURNING total_hits, reset_at
        `,
        [this.keyFor(key), this.windowMs],
      );

      const row = result.rows?.[0];
      const totalHits = Number(row?.total_hits);
      const resetTime = new Date(row?.reset_at);

      if (!Number.isInteger(totalHits) || totalHits < 1 || Number.isNaN(resetTime.getTime())) {
        throw new Error("Rate limit counter query returned an unexpected row.");
      }

      return { totalHits, resetTime };
    } catch (error) {
      // Fail open: a counter outage must not lock every user out of login.
      console.error("[RATE LIMIT STORE FAILED]", { name: error?.name, code: error?.code });

      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  async decrement(key) {
    try {
      await pool.query(
        `
          UPDATE auth_rate_limits
          SET total_hits = GREATEST(total_hits - 1, 0)
          WHERE rate_key = $1
        `,
        [this.keyFor(key)],
      );
    } catch (error) {
      console.error("[RATE LIMIT DECREMENT FAILED]", { name: error?.name, code: error?.code });
    }
  }

  async resetKey(key) {
    try {
      await pool.query("DELETE FROM auth_rate_limits WHERE rate_key = $1", [this.keyFor(key)]);
    } catch (error) {
      console.error("[RATE LIMIT RESET FAILED]", { name: error?.name, code: error?.code });
    }
  }
}

export function createRateLimiter({ name, windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: new PostgresRateLimitStore(windowMs, name),
    handler(req, res, next, options) {
      if (++requestsSinceLastPrune % PRUNE_SAMPLE_RATE === 0) {
        pool
          .query("DELETE FROM auth_rate_limits WHERE reset_at <= NOW()")
          .catch((error) => {
            console.error("[RATE LIMIT PRUNE FAILED]", { name: error?.name, code: error?.code });
          });
      }

      res.status(options.statusCode).json({
        success: false,
        status: "error",
        message,
        requestId: req.requestId,
      });
    },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const tooManyRequests = "Too many requests. Please wait a moment and try again.";
const tooManyEmails = "Too many requests. Please wait before requesting another email.";

export const registerLimiter = createRateLimiter({
  name: "register",
  windowMs: HOUR,
  limit: 5,
  message: "Too many accounts created from this network. Please try again later.",
});

export const loginLimiter = createRateLimiter({
  name: "login",
  windowMs: 15 * MINUTE,
  limit: 10,
  message: tooManyRequests,
});

export const googleLoginLimiter = createRateLimiter({
  name: "google",
  windowMs: 15 * MINUTE,
  limit: 10,
  message: tooManyRequests,
});

export const verifyEmailLimiter = createRateLimiter({
  name: "verify-email",
  windowMs: 15 * MINUTE,
  limit: 10,
  message: tooManyRequests,
});

export const resendVerificationLimiter = createRateLimiter({
  name: "resend-verification",
  windowMs: HOUR,
  limit: 3,
  message: tooManyEmails,
});

export const forgotPasswordLimiter = createRateLimiter({
  name: "forgot-password",
  windowMs: HOUR,
  limit: 3,
  message: tooManyEmails,
});

export const resetPasswordLimiter = createRateLimiter({
  name: "reset-password",
  windowMs: 15 * MINUTE,
  limit: 10,
  message: tooManyRequests,
});