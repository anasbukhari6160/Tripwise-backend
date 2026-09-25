import express from "express";

import {
  getCurrentUser,
  login,
  logout,
  register,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  googleLogin,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationCode);
router.post("/login", login);
router.get("/me", getCurrentUser);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/google", googleLogin);
export default router;
