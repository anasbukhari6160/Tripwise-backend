import { env } from "./env.js";

export const sessionCookieName = "tripwise.sid";
export const sessionCookieOptions = Object.freeze({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: env.isProduction ? "none" : "lax",
  path: "/",
});
