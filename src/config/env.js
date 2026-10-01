import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";
const emailMode = process.env.EMAIL_MODE?.trim() || "resend";
const requiredVariables = ["DATABASE_URL", "SESSION_SECRET", "STRIPE_SECRET_KEY"];
if (isProduction) requiredVariables.push("FRONTEND_URL", "GOOGLE_CLIENT_ID");
if (emailMode === "resend") requiredVariables.push("RESEND_API_KEY", "EMAIL_FROM");

const missing = requiredVariables.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  throw new Error("Missing required environment variables: " + missing.join(", "));
}
if (!["console", "resend"].includes(emailMode) || (isProduction && emailMode !== "resend")) {
  throw new Error("EMAIL_MODE must be resend in production; development also supports console.");
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}
let frontendUrl;
try {
  frontendUrl = new URL(process.env.FRONTEND_URL?.trim() || "http://localhost:5173");
} catch {
  throw new Error("FRONTEND_URL is invalid.");
}
if (!["http:", "https:"].includes(frontendUrl.protocol) ||
    (isProduction && frontendUrl.protocol !== "https:") ||
    frontendUrl.username || frontendUrl.password || frontendUrl.search || frontendUrl.hash ||
    frontendUrl.pathname.replace(/\/+$/, "")) {
  throw new Error("FRONTEND_URL must be an HTTP origin, using HTTPS in production.");
}

export const env = Object.freeze({
  isProduction,
  NODE_ENV: isProduction ? "production" : process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  FRONTEND_ORIGIN: frontendUrl.origin,
  EMAIL_MODE: emailMode,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim() || null,
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() || null,
  EMAIL_FROM: process.env.EMAIL_FROM?.trim() || null,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.trim() || null,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID?.trim() || null,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
  PEXELS_API_KEY: process.env.PEXELS_API_KEY?.trim() || null,
  CONTACT_RECEIVER_EMAIL: process.env.CONTACT_RECEIVER_EMAIL?.trim() || null,
  GROQ_API_KEY: process.env.GROQ_API_KEY?.trim() || null,
  GROQ_MODEL: process.env.GROQ_MODEL?.trim() || null,
  EXA_API_KEY: process.env.EXA_API_KEY?.trim() || null,
});
