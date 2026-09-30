import express from "express";
import cors from "cors";
import session from "express-session";

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

app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "TripWise API is running",
  });
});
app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);
/* =========================================================
   CORS
========================================================= */
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

/* =========================================================
   STRIPE WEBHOOK

   Must stay BEFORE express.json()
   because Stripe needs the raw request body.
========================================================= */

app.post(
  "/api/payments/webhook",

  express.raw({
    type: "application/json",
  }),

  handleStripeWebhook,
);

/* =========================================================
   JSON BODY PARSER
========================================================= */

app.use(express.json());

/* =========================================================
   SESSION
========================================================= */

app.use(
  session({
    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      secure: false,

      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

/* =========================================================
   API ROUTES
========================================================= */

app.use("/api/health", healthRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/weather", weatherRoutes);

app.use("/api/profile", profileRoutes);

app.use("/api/saved", savedRoutes);

app.use("/api/payments", paymentRoutes);

app.use("/api/locations", locationRoutes);

app.use("/api/trips", tripRoutes);

app.use("/api/photos", photoRoutes);

app.use("/api/contact", contactRoutes);

/* =========================================================
   TRIPWISE AI
========================================================= */

app.use("/api/ai", aiRoutes);

export default app;
