import pool from "../config/db.js";

export async function getProfile(req, res) {
  try {
    const userId = req.session.userId;

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

export async function updateProfile(req, res) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { name } = req.body;

    const cleanName = name?.trim();

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

export async function deleteProfile(req, res) {
  try {
    const userId = req.session.userId;

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
