import pool from "../config/db.js";

export async function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        password_hash,
        google_id,
        auth_provider,
        is_verified,

        verification_code_hash,
        verification_expires_at,

        password_reset_code_hash,
        password_reset_expires_at,

        plan,
        subscription_status,
        subscription_current_period_end,
        cancel_at_period_end,

        created_at,
        updated_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  return result.rows[0] || null;
}

export async function createUser(
  name,
  email,
  passwordHash,
  verificationCodeHash,
  verificationExpiresAt,
) {
  const normalizedEmail = email.trim().toLowerCase();

  const result = await pool.query(
    `
      INSERT INTO users (
        name,
        email,
        password_hash,
        auth_provider,
        is_verified,
        verification_code_hash,
        verification_expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'local',
        FALSE,
        $4,
        $5
      )
      RETURNING
        id,
        name,
        email,
        google_id,
        auth_provider,
        plan,
        is_verified,
        subscription_status,
        subscription_current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
    `,
    [
      name.trim(),
      normalizedEmail,
      passwordHash,
      verificationCodeHash,
      verificationExpiresAt,
    ],
  );

  return result.rows[0];
}
