import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { env } from "./config/env.js";
import { sessionCookieName, sessionCookieOptions } from "./config/session.js";
import { requestLogger } from "./middleware/requestLogger.js";

import pool from "./config/db.js";

import photoRoutes from "./routes/photo.routes.js";
import weatherRoutes from "./routes/weather.routes.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import savedRoutes from "./routes/saved.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import locationRoutes from "./routes/location.routes.js";
import tripRoutes from "./routes/trip.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import aiRoutes from "./routes/ai.routes.js";

import { handleStripeWebhook } from "./controllers/payment.controller.js";

const app = express();
const PostgreSQLSessionStore = connectPgSimple(session);
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(requestLogger);

const allowedOrigins = new Set([
  env.FRONTEND_ORIGIN,
  ...(!env.isProduction ? ["http://localhost:5173"] : []),
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ""))) {
      return callback(null, true);
    }
    const error = new Error("Request origin is not allowed.");
    error.status = 403;
    error.code = "CORS_ORIGIN_DENIED";
    callback(error);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400,
}));

app.get("/", (req, res) => res.json({
  success: true,
  message: "TripWise API is running",
  environment: env.NODE_ENV,
}));
app.use("/api/health", healthRoutes);

// Stripe signature verification requires the raw body before JSON parsing.
app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }), handleStripeWebhook);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

export const sessionStore = new PostgreSQLSessionStore({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true,
  pruneSessionInterval: 60 * 15,
  errorLog: (error) => console.error("[SESSION STORE ERROR]", { name: error?.name, code: error?.code }),
});
app.use(session({
  name: sessionCookieName,
  store: sessionStore,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: env.isProduction,
  cookie: { ...sessionCookieOptions, maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

app.use("/api/auth", authRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/saved", savedRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/ai", aiRoutes);

app.use((req, res) => res.status(404).json({
  success: false,
  status: "error",
  message: "Route not found",
  requestId: req.requestId,
}));
app.use((error, req, res, next) => {
  console.error("[APPLICATION ERROR]", { requestId: req.requestId, name: error.name, code: error.code, status: error.status || 500 });
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status : 500;
  const messages = {
    400: "Invalid request.",
    403: "Request origin is not allowed.",
    413: "Request body is too large.",
    415: "Unsupported request encoding.",
  };
  res.status(status).json({
    success: false,
    status: "error",
    message: messages[status] || "Internal server error.",
    requestId: req.requestId,
  });
});

export default app;
