import pool from "../config/db.js";

export async function findUserByEmail(email) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);

  return result.rows[0];
}

export async function createUser(
  name,
  email,
  passwordHash,
  verificationCodeHash,
  verificationExpiresAt,
) {
  const result = await pool.query(
    `INSERT INTO users (
      name,
      email,
      password_hash,
      verification_code_hash,
      verification_expires_at
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id,
      name,
      email,
      plan,
      is_verified,
      created_at`,
    [name, email, passwordHash, verificationCodeHash, verificationExpiresAt],
  );

  return result.rows[0];
}
