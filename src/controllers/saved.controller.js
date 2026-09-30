import pool from "../config/db.js";

const FREE_SAVED_LIMIT = 1;

export async function getSavedDestinations(req, res) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const userResult = await pool.query(
      `
        SELECT plan
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const plan = userResult.rows[0].plan;

    const result = await pool.query(
      `
        SELECT
          id,
          city,
          country,
          latitude,
          longitude,
          created_at
        FROM saved_destinations
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId],
    );

    const count = result.rows.length;
    const isPro = plan === "pro";

    return res.status(200).json({
      success: true,
      destinations: result.rows,
      count,
      plan,
      limit: isPro ? null : FREE_SAVED_LIMIT,
      canSaveMore: isPro || count < FREE_SAVED_LIMIT,
    });
  } catch (error) {
    console.error("Get saved destinations error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve saved destinations.",
    });
  }
}

export async function saveDestination(req, res) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { city, country, latitude, longitude } = req.body;

    const cleanCity = city?.trim();
    const cleanCountry = country?.trim();

    if (!cleanCity || !cleanCountry) {
      return res.status(400).json({
        success: false,
        message: "City and country are required.",
      });
    }

    if (
      latitude !== undefined &&
      latitude !== null &&
      (Number.isNaN(Number(latitude)) ||
        Number(latitude) < -90 ||
        Number(latitude) > 90)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude.",
      });
    }

    if (
      longitude !== undefined &&
      longitude !== null &&
      (Number.isNaN(Number(longitude)) ||
        Number(longitude) < -180 ||
        Number(longitude) > 180)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude.",
      });
    }

    const userResult = await pool.query(
      `
        SELECT plan
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const plan = userResult.rows[0].plan;

    const existingDestination = await pool.query(
      `
          SELECT id
          FROM saved_destinations
          WHERE
            user_id = $1
            AND LOWER(city) = LOWER($2)
            AND LOWER(country) = LOWER($3)
        `,
      [userId, cleanCity, cleanCountry],
    );

    if (existingDestination.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Destination is already saved.",
      });
    }

    if (plan !== "pro") {
      const countResult = await pool.query(
        `
          SELECT COUNT(*)::INTEGER AS count
          FROM saved_destinations
          WHERE user_id = $1
        `,
        [userId],
      );

      const savedCount = countResult.rows[0].count;

      if (savedCount >= FREE_SAVED_LIMIT) {
        return res.status(403).json({
          success: false,
          message:
            "Free users can save only 1 destination. Upgrade to Pro for unlimited saved destinations.",
          upgradeRequired: true,
          limit: FREE_SAVED_LIMIT,
        });
      }
    }

    const result = await pool.query(
      `
        INSERT INTO saved_destinations (
          user_id,
          city,
          country,
          latitude,
          longitude
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          city,
          country,
          latitude,
          longitude,
          created_at
      `,
      [userId, cleanCity, cleanCountry, latitude ?? null, longitude ?? null],
    );

    return res.status(201).json({
      success: true,
      message: "Destination saved successfully.",
      destination: result.rows[0],
    });
  } catch (error) {
    console.error("Save destination error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save destination.",
    });
  }
}

export async function deleteSavedDestination(req, res) {
  try {
    const userId = req.session.userId;
    const destinationId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!Number.isInteger(destinationId) || destinationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid destination ID.",
      });
    }

    const result = await pool.query(
      `
        DELETE FROM saved_destinations
        WHERE id = $1
          AND user_id = $2
        RETURNING id
      `,
      [destinationId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Saved destination not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Destination removed successfully.",
    });
  } catch (error) {
    console.error("Delete saved destination error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to remove destination.",
    });
  }
}
