import "dotenv/config";

import app, { sessionStore } from "./src/app.js";
import pool from "./src/config/db.js";

const HOST = "0.0.0.0";

function resolvePort(value) {
  const port = Number(value);

  if (value?.trim() && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return Number.isInteger(port) && port > 0 ? port : 3000;
}

let server;
let shuttingDown = false;

async function verifyDatabaseConnection() {
  const startedAt = Date.now();

  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    console.log("[DATABASE READY]", {
      timestamp: new Date().toISOString(),
      databaseTime: result.rows[0]?.current_time,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[DATABASE CONNECTION FAILED]", { timestamp: new Date().toISOString(), name: error.name, code: error.code, failure: /timeout/i.test(error.message) ? "timeout" : "connection-error", durationMs: Date.now() - startedAt });

    throw error;
  }
}

async function startServer() {
  try {
    const port = resolvePort(process.env.PORT);

    await verifyDatabaseConnection();

    server = app.listen(port, HOST, () => {
      console.log("[SERVER STARTED]", {
        timestamp: new Date().toISOString(),
        host: HOST,
        port,
        environment: process.env.NODE_ENV || "development",
      });
    });

    server.on("error", (error) => {
      console.error("[SERVER ERROR]", { timestamp: new Date().toISOString(), code: error.code });

      process.exit(1);
    });
  } catch (error) {
    console.error("[STARTUP FAILED]", { timestamp: new Date().toISOString(), code: error.code });

    try {
      await pool.end();
    } catch (poolError) {
      console.error("[DATABASE POOL CLOSE FAILED]", { name: poolError.name, code: poolError.code });
    }

    process.exit(1);
  }
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  sessionStore.close();
  console.log("[SHUTDOWN STARTED]", {
    timestamp: new Date().toISOString(),
    signal,
  });

  const forceShutdownTimer = setTimeout(() => {
    console.error("[FORCED SHUTDOWN]", { timestamp: new Date().toISOString() });

    process.exit(1);
  }, 10000);

  forceShutdownTimer.unref();

  try {

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await pool.end();

    console.log("[SHUTDOWN COMPLETE]", {
      timestamp: new Date().toISOString(),
    });

    process.exit(exitCode);
  } catch (error) {
    console.error("[SHUTDOWN FAILED]", { name: error.name, code: error.code });

    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED PROMISE REJECTION]", { name: reason?.name, code: reason?.code });
  shutdown("UNHANDLED_REJECTION", 1);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", { name: error.name, code: error.code });

  shutdown("UNCAUGHT_EXCEPTION", 1);
});

startServer();
