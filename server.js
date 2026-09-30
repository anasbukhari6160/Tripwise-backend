import "dotenv/config";

import app from "./src/app.js";
import pool from "./src/config/db.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TripWise API running on port ${PORT}`);

  pool
    .query("SELECT NOW()")
    .then(() => {
      console.log("PostgreSQL connected successfully");
    })
    .catch((error) => {
      console.error("PostgreSQL connection failed:", error);
    });
});
