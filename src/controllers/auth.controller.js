import bcrypt from "bcrypt";
import crypto from "crypto";

import pool from "../config/db.js";

import { createUser, findUserByEmail } from "../db/user.queries.js";

import { sendVerificationEmail } from "../services/email.service.js";

export async function register(req, res) {
  try {
    let { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    name = name.trim();
    email = email.trim().toLowerCase();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const allowedDomains = [
      "gmail.com",
      "outlook.com",
      "yahoo.com",
      "tripwise.com",
    ];

    const emailDomain = email.split("@")[1];

    if (!allowedDomains.includes(emailDomain)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);

    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const user = await createUser(
      name,
      email,
      passwordHash,
      verificationCodeHash,
      verificationExpiresAt,
    );

    try {
      await sendVerificationEmail(email, verificationCode, name);
    } catch (emailError) {
      await pool.query("DELETE FROM users WHERE id = $1", [user.id]);

      console.error("Verification email error:", emailError);

      return res.status(502).json({
        success: false,
        message: "Unable to send verification email. Please try again.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Account created. Please verify your email address.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
    });
  }
}

export async function verifyEmail(req, res) {
  try {
    let { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and verification code are required.",
      });
    }

    email = email.trim().toLowerCase();
    code = code.toString().trim();

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified.",
      });
    }

    if (
      !user.verification_expires_at ||
      new Date() > new Date(user.verification_expires_at)
    ) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired.",
      });
    }

    if (!user.verification_code_hash) {
      return res.status(400).json({
        success: false,
        message: "No verification code found.",
      });
    }

    const codeMatches = await bcrypt.compare(code, user.verification_code_hash);

    if (!codeMatches) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
      });
    }

    await pool.query(
      `UPDATE users
       SET
         is_verified = TRUE,
         verification_code_hash = NULL,
         verification_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id],
    );

    return res.status(200).json({
      success: true,
      message: "Email verified successfully.",
    });
  } catch (error) {
    console.error("Verify email error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
    });
  }
}

export async function login(req, res) {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    email = email.trim().toLowerCase();

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before signing in.",
      });
    }

    req.session.userId = user.id;

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
    });
  }
}

export async function getCurrentUser(req, res) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }

    const result = await pool.query(
      `SELECT
         id,
         name,
         email,
         plan,
         is_verified
       FROM users
       WHERE id = $1`,
      [req.session.userId],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Current user error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
    });
  }
}

export function logout(req, res) {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "Logout failed.",
      });
    }

    res.clearCookie("connect.sid");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  });
}
export async function resendVerificationCode(req, res) {
  try {
    let { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    email = email.trim().toLowerCase();

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified.",
      });
    }

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);

    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await sendVerificationEmail(email, verificationCode, user.name);

    await pool.query(
      `UPDATE users
       SET
         verification_code_hash = $1,
         verification_expires_at = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [verificationCodeHash, verificationExpiresAt, user.id],
    );

    return res.status(200).json({
      success: true,
      message: "A new verification code has been sent.",
    });
  } catch (error) {
    console.error("Resend verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resend verification code.",
    });
  }
}