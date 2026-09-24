import "dotenv/config";

import app from "./src/app.js";
import pool from "./src/config/db.js";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await pool.query("SELECT NOW()");

    console.log("PostgreSQL connected successfully");

    app.listen(PORT, () => {
      console.log(`TripWise API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
}

startServer();
