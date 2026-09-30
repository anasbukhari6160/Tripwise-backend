import "dotenv/config";

import app from "./src/app.js";
import pool from "./src/config/db.js";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await pool.query("SELECT NOW()");
    console.log("PostgreSQL connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`TripWise API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();