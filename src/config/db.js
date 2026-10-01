import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.DATABASE_URL,

  max: 10,

  connectionTimeoutMillis: 10000,

  idleTimeoutMillis: 30000,

  query_timeout: 15000,

  statement_timeout: 15000,

  idle_in_transaction_session_timeout: 15000,

  keepAlive: true,

  application_name: "tripwise-api",
});

pool.on("error", (error) => {

  console.error("[DATABASE POOL ERROR]", { timestamp: new Date().toISOString(), name: error.name, code: error.code });
});

export default pool;
