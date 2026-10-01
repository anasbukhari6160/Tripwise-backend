import { env } from "../config/env.js";
import { sessionCookieName, sessionCookieOptions } from "../config/session.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import pool from "../config/db.js";

import { createUser, findUserByEmail } from "../db/user.queries.js";

import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../services/email.service.js";

const googleClient = new OAuth2Client();

const GOOGLE_TIMEOUT_MS = 10000;
const SESSION_TIMEOUT_MS = 30000;

function withTimeout(promise, milliseconds, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} timed out after ${milliseconds}ms`);

      error.code = "OPERATION_TIMEOUT";
      error.operation = label;

      reject(error);
    }, milliseconds);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function getRequestId(req) {
  return req.requestId || "unknown";
}

function logControllerError({ req, controller, stage, error }) {
  console.error(`[${controller} FAILED]`, { timestamp: new Date().toISOString(), requestId: getRequestId(req), stage, name: error?.name, code: error?.code });
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,

    plan: user.plan || "free",

    subscription_status: user.subscription_status || "inactive",

    subscription_current_period_end:
      user.subscription_current_period_end || null,

    cancel_at_period_end: user.cancel_at_period_end ?? false,

    isVerified: Boolean(user.is_verified),
  };
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      reject(new Error("Session middleware is not available."));

      return;
    }

    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      reject(new Error("Session middleware is not available."));

      return;
    }

    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function establishAuthenticatedSession(req, userId) {

  await withTimeout(
    regenerateSession(req),
    SESSION_TIMEOUT_MS,
    "Session regeneration",
  );

  req.session.userId = userId;

  try {
    await withTimeout(saveSession(req), SESSION_TIMEOUT_MS, "Session save");
  } catch (error) {
    req.session = null;
    throw error;
  }
}

export async function googleLogin(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  try {
    const { credential } = req.body ?? {};

    if (typeof credential !== "string" || !credential.trim()) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required.",
        requestId,
      });
    }

    if (!env.GOOGLE_CLIENT_ID) {
      const error = new Error("GOOGLE_CLIENT_ID is not configured.");

      error.code = "MISSING_GOOGLE_CLIENT_ID";

      throw error;
    }

    stage = "google-token-verification";

    const ticket = await withTimeout(
      googleClient.verifyIdToken({
        idToken: credential,
        audience: env.GOOGLE_CLIENT_ID,
      }),
      GOOGLE_TIMEOUT_MS,
      "Google token verification",
    );

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google account.",
        requestId,
      });
    }

    const {
      sub: googleId,
      email,
      name,
      email_verified: emailVerified,
    } = payload;

    if (!googleId || !email || !emailVerified) {
      return res.status(401).json({
        success: false,
        message: "Google email could not be verified.",
        requestId,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    stage = "database-user-lookup";

    let user = await findUserByEmail(normalizedEmail);

    if (user) {
      if (user.google_id && user.google_id !== googleId) {
        console.error("[GOOGLE ACCOUNT LINK CONFLICT]", { timestamp: new Date().toISOString(), requestId, userId: user.id });

        return res.status(409).json({
          success: false,
          message: "This email is linked to another Google account.",
          requestId,
        });
      }

      if (!user.google_id || !user.is_verified) {
        stage = "database-google-link";

        const result = await pool.query(
            `
              UPDATE users
              SET
                google_id = $1,
                is_verified = TRUE,
                verification_code_hash = NULL,
                verification_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
              RETURNING *
            `,
            [googleId, user.id],
          );

        user = result.rows[0];
      }
    } else {

      stage = "database-google-user-create";

      const result = await pool.query(
          `
            INSERT INTO users (
              name,
              email,
              google_id,
              auth_provider,
              is_verified
            )
            VALUES (
              $1,
              $2,
              $3,
              'google',
              TRUE
            )
            RETURNING *
          `,
          [name || "Google User", normalizedEmail, googleId],
        );

      user = result.rows[0];
    }

    if (!user) {
      throw new Error("Google authentication did not return a user.");
    }

    stage = "session-establishment";

    await establishAuthenticatedSession(req, user.id);

    return res.status(200).json({
      success: true,
      message: "Google sign-in successful.",
      user: serializeUser(user),
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "GOOGLE AUTH",
      stage,
      error,
    });

    if (error.code === "OPERATION_TIMEOUT") {
      return res.status(503).json({ success: false, message: "Authentication service timed out. Please try again.", requestId });
    }

    if (stage === "google-token-verification") {
      return res.status(401).json({
        success: false,
        message: "Google authentication failed.",
        requestId,
      });
    }

    if (error.code === "MISSING_GOOGLE_CLIENT_ID") {
      return res.status(503).json({
        success: false,
        message: "Google authentication is temporarily unavailable.",
        requestId,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to complete Google sign-in.",
      stage,
      requestId,
    });
  }
}

export async function register(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  try {
    let { name, email, password } = req.body ?? {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
        requestId,
      });
    }

    name = name.trim();
    email = email.trim().toLowerCase();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
        requestId,
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
        requestId,
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
        requestId,
      });
    }

    stage = "database-user-lookup";

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
        requestId,
      });
    }

    stage = "verification-code-generation";

    const passwordHash = await bcrypt.hash(password, 10);

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);

    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    stage = "database-user-create";

    const user = await createUser(
        name,
        email,
        passwordHash,
        verificationCodeHash,
        verificationExpiresAt,
      );

    stage = "verification-email-send";

    try {
      await sendVerificationEmail(email, verificationCode, name);
    } catch (emailError) {

      logControllerError({
        req,
        controller: "REGISTER EMAIL",
        stage,
        error: emailError,
      });

      return res.status(502).json({
        success: false,
        message:
          "Account was created, but the verification email could not be sent. Please use resend verification.",
        canResend: true,
        email,
        requestId,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Account created. Please verify your email address.",
      user: serializeUser(user),
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "REGISTER",
      stage,
      error,
    });

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
        requestId,
      });
    }

    if (error.code === "OPERATION_TIMEOUT") {
      return res.status(503).json({
        success: false,
        message: "The service is temporarily unavailable. Please try again.",
        requestId,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create account.",
      requestId,
    });
  }
}

export async function verifyEmail(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  try {
    let { email, code } = req.body ?? {};

    if (typeof email !== "string" || code === undefined || code === null) {
      return res.status(400).json({
        success: false,
        message: "Email and verification code are required.",
        requestId,
      });
    }

    email = email.trim().toLowerCase();

    code = code.toString().trim();

    stage = "database-user-lookup";

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
        requestId,
      });
    }

    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified.",
        requestId,
      });
    }

    if (
      !user.verification_expires_at ||
      new Date() > new Date(user.verification_expires_at)
    ) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired.",
        requestId,
      });
    }

    if (!user.verification_code_hash) {
      return res.status(400).json({
        success: false,
        message: "No verification code found.",
        requestId,
      });
    }

    stage = "verification-code-check";

    const codeMatches = await bcrypt.compare(code, user.verification_code_hash);

    if (!codeMatches) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
        requestId,
      });
    }

    stage = "database-verification-update";

    await pool.query(
        `
          UPDATE users
          SET
            is_verified = TRUE,
            verification_code_hash = NULL,
            verification_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
        [user.id],
      );

    return res.status(200).json({
      success: true,
      message: "Email verified successfully.",
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "VERIFY EMAIL",
      stage,
      error,
    });

    return res.status(error.code === "OPERATION_TIMEOUT" ? 503 : 500).json({
      success: false,
      message: "Unable to verify email.",
      requestId,
    });
  }
}

export async function login(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  try {
    let { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
        requestId,
      });
    }

    email = email.trim().toLowerCase();

    stage = "database-user-lookup";

    const user = await findUserByEmail(email);

    if (!user || !user.password_hash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
        requestId,
      });
    }

    stage = "password-check";

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
        requestId,
      });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before signing in.",
        canResend: true,
        email,
        requestId,
      });
    }

    stage = "session-establishment";

    await establishAuthenticatedSession(req, user.id);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: serializeUser(user),
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "LOGIN",
      stage,
      error,
    });

    return res.status(error.code === "OPERATION_TIMEOUT" ? 503 : 500).json({
      success: false,
      message: "Unable to sign in.",
      requestId,
    });
  }
}

export async function getCurrentUser(req, res) {
  const requestId = getRequestId(req);

  let stage = "session-check";

  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
        requestId,
      });
    }

    stage = "database-user-lookup";

    const result = await pool.query(
        `
          SELECT
            id,
            name,
            email,
            plan,
            is_verified,
            subscription_status,
            subscription_current_period_end,
            cancel_at_period_end
          FROM users
          WHERE id = $1
        `,
        [req.session.userId],
      );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
        requestId,
      });
    }

    return res.status(200).json({
      success: true,
      user: serializeUser(user),
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "CURRENT USER",
      stage,
      error,
    });

    return res.status(error.code === "OPERATION_TIMEOUT" ? 503 : 500).json({
      success: false,
      message: "Unable to load user.",
      requestId,
    });
  }
}

export function logout(req, res) {
  const requestId = getRequestId(req);

  if (!req.session) {
    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
      requestId,
    });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("[LOGOUT FAILED]", { timestamp: new Date().toISOString(), requestId });

      return res.status(500).json({
        success: false,
        message: "Logout failed.",
        requestId,
      });
    }

    res.clearCookie(sessionCookieName, sessionCookieOptions);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
      requestId,
    });
  });
}

export async function resendVerificationCode(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  try {
    let { email } = req.body ?? {};

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
        requestId,
      });
    }

    email = email.trim().toLowerCase();

    stage = "database-user-lookup";

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
        requestId,
      });
    }

    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified.",
        requestId,
      });
    }

    stage = "verification-code-generation";

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);

    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const previousHash = user.verification_code_hash || null;

    const previousExpiry = user.verification_expires_at || null;

    stage = "database-code-update";

    await pool.query(
        `
          UPDATE users
          SET
            verification_code_hash = $1,
            verification_expires_at = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `,
        [verificationCodeHash, verificationExpiresAt, user.id],
      );

    stage = "verification-email-send";

    try {
      await sendVerificationEmail(email, verificationCode, user.name);
    } catch (emailError) {

      try {
        await pool.query(
            `
              UPDATE users
              SET
                verification_code_hash = $1,
                verification_expires_at = $2,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $3 AND verification_code_hash = $4
            `,
            [previousHash, previousExpiry, user.id, verificationCodeHash],
          );
      } catch (rollbackError) {
        console.error("[VERIFICATION ROLLBACK FAILED]", { timestamp: new Date().toISOString(), requestId, userId: user.id, code: rollbackError.code });
      }

      throw emailError;
    }

    return res.status(200).json({
      success: true,
      message: "A new verification code has been sent.",
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "RESEND VERIFICATION",
      stage,
      error,
    });

    if (stage === "verification-email-send") {
      return res.status(502).json({
        success: false,
        message: "Unable to send verification email. Please try again.",
        requestId,
      });
    }

    return res.status(error.code === "OPERATION_TIMEOUT" ? 503 : 500).json({
      success: false,
      message: "Unable to resend verification code.",
      requestId,
    });
  }
}

export async function forgotPassword(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  const responseMessage =
    "If an account exists with this email, a reset code has been sent.";

  try {
    let { email } = req.body ?? {};

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
        requestId,
      });
    }

    email = email.trim().toLowerCase();

    stage = "database-user-lookup";

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(200).json({
        success: true,
        message: responseMessage,
        requestId,
      });
    }

    const resetCode = crypto.randomInt(100000, 1000000).toString();

    const resetCodeHash = await bcrypt.hash(resetCode, 10);

    const resetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const previousHash = user.password_reset_code_hash || null;

    const previousExpiry = user.password_reset_expires_at || null;

    stage = "database-reset-code-update";

    await pool.query(
        `
          UPDATE users
          SET
            password_reset_code_hash = $1,
            password_reset_expires_at = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `,
        [resetCodeHash, resetExpiresAt, user.id],
      );

    stage = "password-reset-email-send";

    try {
      await sendPasswordResetEmail(email, resetCode, user.name);
    } catch (emailError) {

      try {
        await pool.query(
            `
              UPDATE users
              SET
                password_reset_code_hash = $1,
                password_reset_expires_at = $2,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $3 AND password_reset_code_hash = $4
            `,
            [previousHash, previousExpiry, user.id, resetCodeHash],
          );
      } catch (rollbackError) {
        console.error("[PASSWORD RESET ROLLBACK FAILED]", { timestamp: new Date().toISOString(), requestId, userId: user.id, code: rollbackError.code });
      }

      throw emailError;
    }

    return res.status(200).json({
      success: true,
      message: responseMessage,
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "FORGOT PASSWORD",
      stage,
      error,
    });

    if (stage === "password-reset-email-send") {
      return res.status(502).json({
        success: false,
        message:
          "Unable to process password reset right now. Please try again.",
        requestId,
      });
    }

    return res.status(error.code === "OPERATION_TIMEOUT" ? 503 : 500).json({
      success: false,
      message: "Unable to process password reset.",
      requestId,
    });
  }
}

export async function resetPassword(req, res) {
  const requestId = getRequestId(req);

  let stage = "request-validation";

  try {
    let { email, code, newPassword } = req.body ?? {};

    if (
      typeof email !== "string" ||
      code === undefined ||
      code === null ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Email, verification code and new password are required.",
        requestId,
      });
    }

    email = email.trim().toLowerCase();

    code = code.toString().trim();

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
        requestId,
      });
    }

    stage = "database-user-lookup";

    const user = await findUserByEmail(email);

    if (
      !user ||
      !user.password_reset_code_hash ||
      !user.password_reset_expires_at
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset code.",
        requestId,
      });
    }

    if (new Date() > new Date(user.password_reset_expires_at)) {
      return res.status(400).json({
        success: false,
        message: "Reset code has expired.",
        requestId,
      });
    }

    stage = "reset-code-check";

    const codeMatches = await bcrypt.compare(
      code,
      user.password_reset_code_hash,
    );

    if (!codeMatches) {
      return res.status(400).json({
        success: false,
        message: "Invalid reset code.",
        requestId,
      });
    }

    stage = "password-hashing";

    const passwordHash = await bcrypt.hash(newPassword, 10);

    stage = "database-password-update";

    await pool.query(
        `
          UPDATE users
          SET
            password_hash = $1,
            password_reset_code_hash = NULL,
            password_reset_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [passwordHash, user.id],
      );

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
      requestId,
    });
  } catch (error) {
    logControllerError({
      req,
      controller: "RESET PASSWORD",
      stage,
      error,
    });

    return res.status(error.code === "OPERATION_TIMEOUT" ? 503 : 500).json({
      success: false,
      message: "Unable to reset password.",
      requestId,
    });
  }
}
