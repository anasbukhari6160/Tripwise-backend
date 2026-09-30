import pool from "../config/db.js";

export async function requirePro(req, res, next) {
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
        SELECT id, plan
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

    const user = result.rows[0];

    if (user.plan !== "pro") {
      return res.status(403).json({
        success: false,
        message: "This feature is available to TripWise Pro users only.",
      });
    }

    req.userId = user.id;

    next();
  } catch (error) {
    console.error("Pro authorization error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify Pro access.",
    });
  }
}
