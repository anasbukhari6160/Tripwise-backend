import express from "express";

import {
  forgotPasswordLimiter,
  googleLoginLimiter,
  loginLimiter,
  registerLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} from "../middleware/rateLimit.js";
import {
  forgotPassword,
  getCurrentUser,
  googleLogin,
  login,
  logout,
  register,
  resendVerificationCode,
  resetPassword,
  verifyEmail,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", registerLimiter, register);

router.post("/login", loginLimiter, login);

router.post("/google", googleLoginLimiter, googleLogin);

router.post("/logout", logout);

router.get("/me", getCurrentUser);

router.post("/verify-email", verifyEmailLimiter, verifyEmail);

router.post("/resend-verification", resendVerificationLimiter, resendVerificationCode);

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

router.post("/reset-password", resetPasswordLimiter, resetPassword);

export default router;
