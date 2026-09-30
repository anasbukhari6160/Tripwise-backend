import bcrypt from "bcrypt";
import crypto from "crypto";
import { Resend } from "resend";

import pool from "../config/db.js";

const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================================================
   GET PROFILE
========================================================= */

export async function getProfile(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          email,
          auth_provider,
          plan,
          is_verified,
          created_at
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve profile.",
    });
  }
}

/* =========================================================
   UPDATE PROFILE
========================================================= */

export async function updateProfile(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};

    const cleanName = typeof body.name === "string" ? body.name.trim() : "";

    if (!cleanName) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be between 2 and 100 characters.",
      });
    }

    const result = await pool.query(
      `
        UPDATE users
        SET
          name = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
          id,
          name,
          email,
          auth_provider,
          plan,
          is_verified,
          created_at,
          updated_at
      `,
      [cleanName, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile.",
    });
  }
}

/* =========================================================
   REQUEST PASSWORD CHANGE
========================================================= */

export async function requestPasswordChange(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};

    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";

    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    /* =========================
       REQUIRED FIELDS
    ========================= */

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Current password, new password and confirmation are required.",
      });
    }

    /* =========================
       PASSWORD VALIDATION
    ========================= */

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "New password cannot exceed 128 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match.",
      });
    }

    /* =========================
       LOAD USER
    ========================= */

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          email,
          password_hash,
          auth_provider
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = result.rows[0];

    /* =========================
       GOOGLE ACCOUNT
    ========================= */

    if (user.auth_provider === "google" && !user.password_hash) {
      return res.status(400).json({
        success: false,
        code: "GOOGLE_ACCOUNT",
        message:
          "This account uses Google Sign-In and does not have a local password.",
      });
    }

    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        message: "This account does not have a password that can be changed.",
      });
    }

    /* =========================
       CURRENT PASSWORD
    ========================= */

    const currentPasswordMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    if (!currentPasswordMatches) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    /* =========================
       PREVENT SAME PASSWORD
    ========================= */

    const samePassword = await bcrypt.compare(newPassword, user.password_hash);

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from your current password.",
      });
    }

    /* =========================
       CREATE OTP
    ========================= */

    const verificationCode = crypto.randomInt(100000, 1000000).toString();

    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);

    const pendingPasswordHash = await bcrypt.hash(newPassword, 10);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    /* =========================
       STORE TEMPORARY CHANGE
    ========================= */

    await pool.query(
      `
        UPDATE users
        SET
          password_change_code_hash = $1,
          password_change_expires_at = $2,
          pending_password_hash = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `,
      [verificationCodeHash, expiresAt, pendingPasswordHash, userId],
    );

    /* =========================
       SEND EMAIL
    ========================= */

    const emailResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "TripWise <onboarding@resend.dev>",

      to: user.email,

      subject: "Verify your TripWise password change",

      html: `
          <div
            style="
              font-family: Arial, sans-serif;
              max-width: 520px;
              margin: 0 auto;
              background: #080c07;
              color: #f4f7f1;
              padding: 32px;
              border-radius: 16px;
            "
          >
            <h2
              style="
                margin-top: 0;
                color: #caff33;
              "
            >
              TripWise Password Verification
            </h2>

            <p>
              Hi ${user.name},
            </p>

            <p>
              We received a request to
              change your TripWise password.
            </p>

            <p>
              Enter this verification code:
            </p>

            <div
              style="
                margin: 24px 0;
                padding: 18px;
                background: #10160e;
                border: 1px solid #273122;
                border-radius: 12px;
                text-align: center;
                font-size: 30px;
                font-weight: 800;
                letter-spacing: 8px;
                color: #caff33;
              "
            >
              ${verificationCode}
            </div>

            <p>
              This code expires in
              10 minutes.
            </p>

            <p
              style="
                color: #879182;
                font-size: 13px;
              "
            >
              If you did not request this
              password change, you can
              ignore this email.
            </p>
          </div>
        `,
    });

    if (emailResult.error) {
      console.error("Resend password email error:", emailResult.error);

      await pool.query(
        `
          UPDATE users
          SET
            password_change_code_hash = NULL,
            password_change_expires_at = NULL,
            pending_password_hash = NULL
          WHERE id = $1
        `,
        [userId],
      );

      return res.status(500).json({
        success: false,
        message: "Unable to send verification email.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your registered email.",
    });
  } catch (error) {
    console.error("Request password change error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send password verification code.",
    });
  }
}

/* =========================================================
   VERIFY PASSWORD CHANGE
========================================================= */

export async function verifyPasswordChange(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};

    const code = typeof body.code === "string" ? body.code.trim() : "";

    /* =========================
       VALIDATE CODE
    ========================= */

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Verification code is required.",
      });
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Verification code must contain 6 digits.",
      });
    }

    /* =========================
       LOAD PENDING REQUEST
    ========================= */

    const result = await pool.query(
      `
        SELECT
          password_change_code_hash,
          password_change_expires_at,
          pending_password_hash
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = result.rows[0];

    if (
      !user.password_change_code_hash ||
      !user.password_change_expires_at ||
      !user.pending_password_hash
    ) {
      return res.status(400).json({
        success: false,
        message: "No pending password change request was found.",
      });
    }

    /* =========================
       EXPIRATION
    ========================= */

    const expirationTime = new Date(user.password_change_expires_at).getTime();

    if (Number.isNaN(expirationTime) || expirationTime < Date.now()) {
      await pool.query(
        `
          UPDATE users
          SET
            password_change_code_hash = NULL,
            password_change_expires_at = NULL,
            pending_password_hash = NULL
          WHERE id = $1
        `,
        [userId],
      );

      return res.status(400).json({
        success: false,
        code: "CODE_EXPIRED",
        message: "Verification code has expired. Please request a new code.",
      });
    }

    /* =========================
       VERIFY OTP
    ========================= */

    const codeMatches = await bcrypt.compare(
      code,
      user.password_change_code_hash,
    );

    if (!codeMatches) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CODE",
        message: "Invalid verification code.",
      });
    }

    /* =========================
       COMMIT PASSWORD CHANGE
    ========================= */

    await pool.query(
      `
        UPDATE users
        SET
          password_hash = pending_password_hash,

          password_change_code_hash = NULL,
          password_change_expires_at = NULL,
          pending_password_hash = NULL,

          password_reset_code_hash = NULL,
          password_reset_expires_at = NULL,

          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [userId],
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Verify password change error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify password change.",
    });
  }
}

/* =========================================================
   DELETE PROFILE
========================================================= */

export async function deleteProfile(req, res) {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await pool.query(
      `
        DELETE FROM users
        WHERE id = $1
        RETURNING id
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        console.error("Delete account session error:", sessionError);

        return res.status(500).json({
          success: false,
          message: "Account was deleted, but the session could not be cleared.",
        });
      }

      res.clearCookie("connect.sid");

      return res.status(200).json({
        success: true,
        message: "Account deleted successfully.",
      });
    });
  } catch (error) {
    console.error("Delete profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete account.",
    });
  }
}
